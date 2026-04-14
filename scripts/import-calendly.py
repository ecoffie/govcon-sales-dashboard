#!/usr/bin/env python3
"""
Import Calendly events CSV into GovCon Sales Team lead database.
Reads CSV, deduplicates by email, scores leads, merges with existing master-sheet.json.
"""

import csv
import json
import os
import re
from datetime import datetime, timezone
from collections import defaultdict

# Paths
CSV_PATH = "/Users/kkii/Downloads/events-export 4.csv"
DATA_DIR = "/Users/kkii/Documents/Cursor/Govcon Sales Team/data"
MASTER_SHEET = os.path.join(DATA_DIR, "master-sheet.json")
LEADS_DIR = os.path.join(DATA_DIR, "leads")

NOW = datetime(2026, 4, 11, tzinfo=timezone.utc)

# ── Helpers ──────────────────────────────────────────────────────────────────

def parse_dt(s):
    """Parse Calendly datetime string to ISO format."""
    if not s or not s.strip():
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d %I:%M %p", "%Y-%m-%d %H:%M"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return None


def extract_qa(row):
    """Extract question/response pairs into a dict keyed by lowercase question."""
    qa = {}
    for i in range(1, 11):
        q = row.get(f"Question {i}", "").strip()
        r = row.get(f"Response {i}", "").strip()
        if q and r:
            qa[q.lower()] = r
    return qa


def find_field(qa, keywords):
    """Search qa dict for a key containing any of the keywords. Return first match value."""
    for key, val in qa.items():
        for kw in keywords:
            if kw.lower() in key:
                return val
    return ""


def normalize_source(raw):
    """Map free-text 'where did you hear' to canonical source."""
    if not raw:
        return "unknown"
    r = raw.lower()
    if "youtube" in r or "yt" in r:
        return "youtube"
    if "instagram" in r or "ig" in r:
        return "instagram"
    if "linkedin" in r:
        return "linkedin"
    if "google" in r:
        return "google"
    if "facebook" in r or "fb" in r:
        return "facebook"
    if "tiktok" in r or "tik tok" in r:
        return "tiktok"
    if "referral" in r or "friend" in r or "someone" in r or "colleague" in r or "partner" in r:
        return "referral"
    if "twitter" in r or "x.com" in r:
        return "twitter"
    if "podcast" in r:
        return "podcast"
    if "webinar" in r or "event" in r:
        return "event"
    return "other"


BUYING_SIGNALS = re.compile(
    r"contract|bid|proposal|teaming|rfp|win\s+contract|get\s+contract|"
    r"prime\s+contract|subcontract|sam\.gov|capability\s+statement|"
    r"set[- ]?aside|8\(?a\)?|hubzone|sdvosb|wosb",
    re.IGNORECASE,
)

LEARNING_SIGNALS = re.compile(
    r"learn|interest|curious|understand|information|find\s+out|explore|start|begin|new\s+to",
    re.IGNORECASE,
)

STATUS_RANK = {
    "new": 0,
    "booked": 1,
    "no_show": 2,
    "call_completed": 3,
    "proposal_sent": 4,
    "paid": 5,
    "closed_won": 6,
    "closed_lost": 3,
}

SCORE_RANK = {"BASIC": 0, "WARM": 1, "HOT": 2}

# ── Read CSV ─────────────────────────────────────────────────────────────────

print("Reading CSV...")
events_by_email = defaultdict(list)

with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    total_rows = 0
    for row in reader:
        email = (row.get("Invitee Email") or "").strip().lower()
        if not email:
            continue
        events_by_email[email].append(row)
        total_rows += 1

print(f"  Parsed {total_rows} events for {len(events_by_email)} unique emails")

# ── Build Calendly leads ────────────────────────────────────────────────────

print("Building lead records...")
calendly_leads = {}

for email, events in events_by_email.items():
    # Sort events by start date
    def sort_key(e):
        dt = parse_dt(e.get("Start Date & Time", ""))
        return dt or "0"
    events.sort(key=sort_key)

    latest = events[-1]
    earliest = events[0]

    # Merge all QA pairs (later events override earlier)
    merged_qa = {}
    for ev in events:
        merged_qa.update(extract_qa(ev))

    # Extract fields
    name = latest.get("Invitee Name", "").strip()
    if not name or name == name.lower():
        first = latest.get("Invitee First Name", "").strip()
        last = latest.get("Invitee Last Name", "").strip()
        if first or last:
            name = f"{first} {last}".strip()

    phone = find_field(merged_qa, ["phone number", "phone"])
    if not phone:
        phone = latest.get("Text Reminder Number", "").strip()
    # Clean phone
    phone = phone.lstrip("'").strip() if phone else ""

    company = find_field(merged_qa, ["company name", "company"])
    revenue = find_field(merged_qa, ["company annual revenue", "yearly revenue", "revenue"])
    industry = find_field(merged_qa, ["industry"])
    problem = find_field(merged_qa, ["what problem", "what do you plan", "accomplish", "goal", "help you with"])
    source_raw = find_field(merged_qa, ["where did you hear", "how did you find", "hear about"])
    source = normalize_source(source_raw)

    event_type = latest.get("Event Type Name", "").strip()
    first_contact = parse_dt(earliest.get("Start Date & Time", ""))
    last_call = parse_dt(latest.get("Start Date & Time", ""))
    total_calls = len(events)
    no_show = (latest.get("Marked as No-Show") or "").strip().lower() == "yes"
    canceled = (latest.get("Canceled") or "").strip().lower() == "true"

    guest_emails = []
    for ev in events:
        ge = (ev.get("Guest Email(s)") or "").strip()
        if ge:
            for g in ge.split(","):
                g = g.strip().lower()
                if g and g not in guest_emails:
                    guest_emails.append(g)

    # ── Scoring ──
    score = "BASIC"
    et_lower = event_type.lower()

    if ("accelerator" in et_lower or "consulting" in et_lower or "onboarding" in et_lower
            or total_calls >= 3 or (problem and BUYING_SIGNALS.search(problem))):
        score = "HOT"
    elif ("discovery" in et_lower or "beginners" in et_lower
          or total_calls >= 2 or (problem and LEARNING_SIGNALS.search(problem))):
        score = "WARM"

    # ── Status ──
    if "onboarding" in et_lower:
        status = "paid"
    elif no_show:
        status = "no_show"
    elif last_call and last_call > NOW.isoformat():
        status = "booked"
    elif canceled:
        status = "new"
    else:
        status = "call_completed"

    # ── Last action ──
    if status == "no_show":
        last_action = "no_show"
    elif status == "booked":
        last_action = "booked"
    elif status == "paid":
        last_action = "paid"
    else:
        last_action = "call_completed"

    lead = {
        "id": "",
        "name": name,
        "email": email,
        "phone": phone,
        "company": company,
        "score": score,
        "source": source if source != "unknown" else "calendly",
        "status": status,
        "first_contact_date": first_contact or "",
        "last_action": last_action,
        "last_action_date": last_call or "",
        "follow_up_count": 0,
        "notes": problem,
        "calendly": {
            "event_type": event_type,
            "total_calls": total_calls,
            "last_call_date": last_call or "",
            "no_show": no_show,
        },
        "company_details": {
            "revenue": revenue,
            "industry": industry,
        },
        "gmail_thread_id": "",
        "gmail_labels": [],
        "emails_sent": [],
        "calls": [],
        "_guest_emails": guest_emails,
    }

    calendly_leads[email] = lead

print(f"  Built {len(calendly_leads)} Calendly lead records")

# ── Load existing master sheet ───────────────────────────────────────────────

print("Loading existing master-sheet.json...")
existing_leads = {}
if os.path.exists(MASTER_SHEET):
    with open(MASTER_SHEET) as f:
        existing = json.load(f)
    for lead in existing:
        e = (lead.get("email") or "").strip().lower()
        if e:
            existing_leads[e] = lead
    print(f"  Loaded {len(existing_leads)} existing leads")
else:
    print("  No existing master-sheet found")

# ── Merge ────────────────────────────────────────────────────────────────────

print("Merging...")
merged = {}
merge_count = 0
new_from_calendly = 0
kept_existing = 0

all_emails = set(list(calendly_leads.keys()) + list(existing_leads.keys()))

for email in all_emails:
    cal = calendly_leads.get(email)
    ext = existing_leads.get(email)

    if cal and ext:
        # Merge: keep the richer record
        merge_count += 1
        m = dict(ext)  # Start with existing (may have gmail data, notes, etc.)

        # Add calendly block
        m["calendly"] = cal["calendly"]
        m["company_details"] = m.get("company_details", {})

        # Fill in blanks from Calendly
        if not m.get("phone") and cal.get("phone"):
            m["phone"] = cal["phone"]
        if not m.get("company") and cal.get("company"):
            m["company"] = cal["company"]
        if not m.get("name") and cal.get("name"):
            m["name"] = cal["name"]

        # Company details
        if cal["company_details"].get("revenue"):
            m["company_details"]["revenue"] = cal["company_details"]["revenue"]
        if cal["company_details"].get("industry"):
            m["company_details"]["industry"] = cal["company_details"]["industry"]

        # Keep highest score
        ext_score = SCORE_RANK.get(m.get("score", "BASIC"), 0)
        cal_score = SCORE_RANK.get(cal.get("score", "BASIC"), 0)
        if cal_score > ext_score:
            m["score"] = cal["score"]

        # Keep most advanced status
        ext_status = STATUS_RANK.get(m.get("status", "new"), 0)
        cal_status = STATUS_RANK.get(cal.get("status", "new"), 0)
        if cal_status > ext_status:
            m["status"] = cal["status"]

        # Earlier first contact
        if cal.get("first_contact_date"):
            if not m.get("first_contact_date") or cal["first_contact_date"] < m["first_contact_date"]:
                m["first_contact_date"] = cal["first_contact_date"]

        # Later last action date
        if cal.get("last_action_date"):
            if not m.get("last_action_date") or cal["last_action_date"] > m["last_action_date"]:
                m["last_action_date"] = cal["last_action_date"]

        # Append Calendly notes if different
        if cal.get("notes") and cal["notes"] not in (m.get("notes") or ""):
            existing_notes = m.get("notes", "") or ""
            if existing_notes:
                m["notes"] = existing_notes + " | Calendly: " + cal["notes"]
            else:
                m["notes"] = cal["notes"]

        # Source: prefer existing if not unknown/calendly
        if m.get("source") in ("unknown", "calendly", "") and cal.get("source") not in ("unknown", "calendly", ""):
            m["source"] = cal["source"]

        # Ensure all expected keys exist
        m.setdefault("gmail_thread_id", "")
        m.setdefault("gmail_labels", [])
        m.setdefault("emails_sent", [])
        m.setdefault("calls", [])
        m.setdefault("follow_up_count", 0)

        merged[email] = m

    elif cal:
        new_from_calendly += 1
        # Remove internal field
        lead = dict(cal)
        del lead["_guest_emails"]
        merged[email] = lead

    else:
        kept_existing += 1
        m = dict(ext)
        m.setdefault("calendly", {"event_type": "", "total_calls": 0, "last_call_date": "", "no_show": False})
        m.setdefault("company_details", {"revenue": "", "industry": ""})
        m.setdefault("gmail_thread_id", m.get("gmail_thread_id", ""))
        m.setdefault("gmail_labels", m.get("gmail_labels", []))
        m.setdefault("emails_sent", m.get("emails_sent", []))
        m.setdefault("calls", m.get("calls", []))
        merged[email] = m

print(f"  Merged (both): {merge_count}")
print(f"  New from Calendly: {new_from_calendly}")
print(f"  Kept from existing: {kept_existing}")

# ── Sort and assign IDs ─────────────────────────────────────────────────────

# Sort: HOT first, then WARM, then BASIC; within each, by last_action_date desc
def sort_key(item):
    email, lead = item
    score_order = {"HOT": 0, "WARM": 1, "BASIC": 2}
    return (
        score_order.get(lead.get("score", "BASIC"), 2),
        -(lead.get("last_action_date") or "0000").__hash__(),  # hack, use string sort
    )

# Better sort: by score then by last_action_date descending
sorted_leads = sorted(
    merged.items(),
    key=lambda x: (
        SCORE_RANK.get(x[1].get("score", "BASIC"), 0) * -1,
        x[1].get("last_action_date") or "0000",
    ),
    reverse=True,
)

# Actually: HOT first (score desc), then most recent first (date desc)
sorted_leads = sorted(
    merged.items(),
    key=lambda x: (
        -SCORE_RANK.get(x[1].get("score", "BASIC"), 0),
        -(x[1].get("last_action_date") or "0000-00-00").__len__(),  # rough
    ),
)

# Simplify: just sort by score rank desc, then last_action_date desc
leads_list = list(merged.values())
leads_list.sort(key=lambda l: (
    -SCORE_RANK.get(l.get("score", "BASIC"), 0),
    l.get("last_action_date") or "",
), reverse=False)

# Actually reverse the date sort so most recent is first within score group
leads_list.sort(key=lambda l: (
    SCORE_RANK.get(l.get("score", "BASIC"), 0),
    l.get("last_action_date") or "",
), reverse=True)

# Assign IDs
for i, lead in enumerate(leads_list, 1):
    lead["id"] = f"lead-{i:03d}"
    # Remove internal fields if present
    lead.pop("_guest_emails", None)

print(f"\nTotal leads in final database: {len(leads_list)}")

# ── Write outputs ────────────────────────────────────────────────────────────

print("\nWriting master-sheet.json...")
with open(MASTER_SHEET, "w") as f:
    json.dump(leads_list, f, indent=2, ensure_ascii=False)
print(f"  Written {len(leads_list)} leads")

print("Writing individual lead files...")
# Delete old files
if os.path.exists(LEADS_DIR):
    for fn in os.listdir(LEADS_DIR):
        if fn.endswith(".json"):
            os.remove(os.path.join(LEADS_DIR, fn))
else:
    os.makedirs(LEADS_DIR)

for lead in leads_list:
    path = os.path.join(LEADS_DIR, f"{lead['id']}.json")
    with open(path, "w") as f:
        json.dump(lead, f, indent=2, ensure_ascii=False)

print(f"  Written {len(leads_list)} individual files")

# ── Summary ──────────────────────────────────────────────────────────────────

print("\n" + "=" * 60)
print("IMPORT SUMMARY")
print("=" * 60)

print(f"\nTotal CSV events parsed: {total_rows}")
print(f"Unique Calendly emails:  {len(calendly_leads)}")
print(f"Existing master-sheet:   {len(existing_leads)}")
print(f"Merged (overlap):        {merge_count}")
print(f"New from Calendly:       {new_from_calendly}")
print(f"Kept existing only:      {kept_existing}")
print(f"FINAL TOTAL LEADS:       {len(leads_list)}")

# By score
from collections import Counter
scores = Counter(l["score"] for l in leads_list)
print(f"\nBy Score:")
for s in ["HOT", "WARM", "BASIC"]:
    print(f"  {s}: {scores.get(s, 0)}")

# By status
statuses = Counter(l["status"] for l in leads_list)
print(f"\nBy Status:")
for s in sorted(statuses.keys(), key=lambda x: -statuses[x]):
    print(f"  {s}: {statuses[s]}")

# By event type (Calendly leads only)
event_types = Counter()
for l in leads_list:
    et = (l.get("calendly") or {}).get("event_type", "")
    if et:
        event_types[et] += 1
print(f"\nBy Calendly Event Type:")
for et, count in event_types.most_common():
    print(f"  {et}: {count}")

# By source
sources = Counter(l.get("source", "unknown") for l in leads_list)
print(f"\nBy Source:")
for s, count in sources.most_common():
    print(f"  {s}: {count}")

print("\nDone!")

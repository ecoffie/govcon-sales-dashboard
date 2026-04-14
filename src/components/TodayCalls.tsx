import { useEffect, useState } from 'react'
import { Phone, Clock, MapPin, User, Building, MessageSquare, ChevronDown, ChevronRight, Star, UserCheck, ExternalLink, Calendar } from 'lucide-react'

interface CallEvent {
  event_id: string
  title: string
  start: string
  end: string
  location: string
  status: string
  minutes_until: number
  attendees: { email: string; name: string; response: string }[]
  lead_match: {
    id: string
    name: string
    company: string
    score: string
    type: string
    client_tier?: string
    status: string
    phone: string
    notes: string
    problem: string
    industry: string
    revenue: string
    total_calls: number
    source: string
    recommended_angle: string
  } | null
}

interface CallsData {
  generated_at: string | null
  today: CallEvent[]
  tomorrow: CallEvent[]
  this_week: CallEvent[]
}

const SCORE_COLORS: Record<string, string> = {
  HOT: 'bg-red-100 text-red-700',
  WARM: 'bg-amber-100 text-amber-700',
  BASIC: 'bg-gray-100 text-gray-600',
}

const RESPONSE_COLORS: Record<string, string> = {
  accepted: 'text-green-600',
  tentative: 'text-amber-600',
  declined: 'text-red-600',
  needsAction: 'text-gray-400',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
}

function CallCard({ call }: { call: CallEvent }) {
  const [expanded, setExpanded] = useState(false)
  const lead = call.lead_match
  const isClient = lead?.type === 'client'
  const now = new Date()
  const start = new Date(call.start)
  const end = new Date(call.end)
  const isLive = now >= start && now <= end
  const isPast = now > end
  const minsUntil = Math.round((start.getTime() - now.getTime()) / 60000)

  return (
    <div className={`rounded-lg border transition-all cursor-pointer ${isLive ? 'border-green-400 bg-green-50 ring-2 ring-green-200' : isPast ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-gray-200 bg-white hover:shadow-sm'}`} onClick={() => setExpanded(!expanded)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`p-2 rounded-lg flex-shrink-0 ${isLive ? 'bg-green-200 text-green-800' : isPast ? 'bg-gray-200 text-gray-500' : 'bg-brand-100 text-brand-700'}`}>
          <Phone size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-sm">{lead?.name || call.attendees[0]?.name || 'Unknown'}</span>
            {lead && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${SCORE_COLORS[lead.score] || 'bg-gray-100'}`}>
                {lead.score}
              </span>
            )}
            {isClient && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
                <UserCheck size={10} /> CLIENT
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
            {lead?.company && <span className="flex items-center gap-1"><Building size={11} />{lead.company}</span>}
            <span className="flex items-center gap-1"><Clock size={11} />{formatTime(call.start)}</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          {isLive ? (
            <span className="text-xs font-bold text-green-700 bg-green-200 px-2 py-1 rounded-full animate-pulse">LIVE NOW</span>
          ) : isPast ? (
            <span className="text-xs text-gray-400">Done</span>
          ) : minsUntil <= 30 ? (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">{minsUntil}m</span>
          ) : minsUntil <= 60 ? (
            <span className="text-xs font-medium text-brand-600">{minsUntil}m</span>
          ) : (
            <span className="text-xs text-gray-400">{Math.round(minsUntil / 60)}h {minsUntil % 60}m</span>
          )}
          {expanded ? <ChevronDown size={14} className="text-gray-400 mt-1" /> : <ChevronRight size={14} className="text-gray-400 mt-1" />}
        </div>
      </div>

      {/* Expanded Briefing */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3">
          {/* Quick Info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {lead?.phone && (
              <div className="bg-gray-50 rounded p-2">
                <span className="text-gray-500 block">Phone</span>
                <span className="font-medium text-gray-800">{lead.phone}</span>
              </div>
            )}
            {lead?.industry && (
              <div className="bg-gray-50 rounded p-2">
                <span className="text-gray-500 block">Industry</span>
                <span className="font-medium text-gray-800">{lead.industry}</span>
              </div>
            )}
            {lead?.revenue && (
              <div className="bg-gray-50 rounded p-2">
                <span className="text-gray-500 block">Revenue</span>
                <span className="font-medium text-gray-800">{lead.revenue}</span>
              </div>
            )}
            {lead?.source && (
              <div className="bg-gray-50 rounded p-2">
                <span className="text-gray-500 block">Source</span>
                <span className="font-medium text-gray-800 capitalize">{lead.source}</span>
              </div>
            )}
            {lead?.total_calls !== undefined && (
              <div className="bg-gray-50 rounded p-2">
                <span className="text-gray-500 block">Previous Calls</span>
                <span className="font-medium text-gray-800">{lead.total_calls}</span>
              </div>
            )}
          </div>

          {/* What They Want */}
          {(lead?.problem || lead?.notes) && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                <MessageSquare size={12} /> What They Want
              </h4>
              <p className="text-sm text-gray-700 bg-green-50 rounded-lg p-3">{lead.problem || lead.notes}</p>
            </div>
          )}

          {/* Recommended Angle */}
          {lead?.recommended_angle && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Star size={12} /> Recommended Angle
              </h4>
              <p className="text-sm text-gray-700 bg-amber-50 rounded-lg p-3 border border-amber-100">{lead.recommended_angle}</p>
            </div>
          )}

          {/* Meeting Link */}
          {call.location && (
            <a href={call.location} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-800 bg-brand-50 rounded-lg px-3 py-2">
              <ExternalLink size={12} /> Join Meeting
            </a>
          )}

          {/* Attendees */}
          {call.attendees.length > 0 && (
            <div className="text-xs text-gray-500">
              {call.attendees.map((a, i) => (
                <span key={i} className={`mr-3 ${RESPONSE_COLORS[a.response] || ''}`}>
                  {a.name || a.email} ({a.response})
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TodayCalls() {
  const [data, setData] = useState<CallsData>({ generated_at: null, today: [], tomorrow: [], this_week: [] })
  const [view, setView] = useState<'today' | 'tomorrow' | 'week'>('today')

  useEffect(() => {
    fetch('/api/calls').then(r => r.json()).then(setData).catch(() => {})
    const interval = setInterval(() => {
      fetch('/api/calls').then(r => r.json()).then(setData).catch(() => {})
    }, 120000) // refresh every 2 min
    return () => clearInterval(interval)
  }, [])

  const calls = view === 'today' ? data.today : view === 'tomorrow' ? data.tomorrow : data.this_week
  const upcomingToday = data.today.filter(c => new Date(c.start) > new Date()).length

  // Group week calls by day
  const weekByDay: Record<string, CallEvent[]> = {}
  if (view === 'week') {
    for (const c of data.this_week) {
      const day = formatDate(c.start)
      if (!weekByDay[day]) weekByDay[day] = []
      weekByDay[day].push(c)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900">Calls</h2>
          {upcomingToday > 0 && (
            <span className="text-xs font-bold bg-brand-100 text-brand-700 px-2 py-1 rounded-full">{upcomingToday} today</span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['today', 'tomorrow', 'week'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {v === 'today' ? 'Today' : v === 'tomorrow' ? 'Tomorrow' : 'This Week'}
            </button>
          ))}
        </div>
      </div>

      {data.generated_at && (
        <p className="text-xs text-gray-400">Last updated: {new Date(data.generated_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
      )}

      {view === 'week' ? (
        Object.keys(weekByDay).length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {Object.entries(weekByDay).map(([day, dayCalls]) => (
              <div key={day}>
                <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2">
                  <Calendar size={14} /> {day}
                  <span className="text-xs font-normal text-gray-400">({dayCalls.length} calls)</span>
                </h3>
                <div className="space-y-2">
                  {dayCalls.map(call => <CallCard key={call.event_id} call={call} />)}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        calls.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {calls.map(call => <CallCard key={call.event_id} call={call} />)}
          </div>
        )
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border p-12 text-center">
      <Phone size={40} className="mx-auto text-gray-300 mb-3" />
      <p className="text-gray-500">No calls scheduled</p>
      <p className="text-xs text-gray-400 mt-1">Calendar data refreshes when agents run</p>
    </div>
  )
}

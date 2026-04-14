import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import Stripe from 'stripe'

const app = express()
const PORT = 3007
const isVercelEnv = process.env.VERCEL === '1'
const DATA_DIR = isVercelEnv
  ? path.resolve(process.cwd(), 'data')
  : path.resolve(import.meta.dirname, '../data')

app.use(cors())
app.use(express.json())

function readJSON(file: string) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'))
  } catch { return null }
}

function readJSONL(file: string) {
  try {
    const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8').trim()
    if (!content) return []
    return content.split('\n').map(line => {
      try { return JSON.parse(line) } catch { return null }
    }).filter(Boolean)
  } catch { return [] }
}

function readReport(subdir: string, filename: string) {
  try {
    return fs.readFileSync(path.join(DATA_DIR, 'reports', subdir, filename), 'utf-8')
  } catch { return null }
}

// --- API Routes ---

// Full lead database
app.get('/api/leads', (_req, res) => {
  const leads = readJSON('master-sheet.json') || []
  res.json(leads)
})

// Single lead
app.get('/api/leads/:id', (req, res) => {
  try {
    const lead = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'leads', `${req.params.id}.json`), 'utf-8'))
    res.json(lead)
  } catch {
    res.status(404).json({ error: 'Lead not found' })
  }
})

// Update lead (for manual edits from dashboard)
app.patch('/api/leads/:id', (req, res) => {
  if (isVercelEnv) return res.status(403).json({ error: 'Write operations disabled in production. Use local server.' })

  const leads = readJSON('master-sheet.json') || []
  const idx = leads.findIndex((l: any) => l.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Lead not found' })

  leads[idx] = { ...leads[idx], ...req.body, last_action_date: new Date().toISOString() }
  fs.writeFileSync(path.join(DATA_DIR, 'master-sheet.json'), JSON.stringify(leads, null, 2))

  // Also update individual lead file
  const leadFile = path.join(DATA_DIR, 'leads', `${req.params.id}.json`)
  if (fs.existsSync(leadFile)) {
    const full = JSON.parse(fs.readFileSync(leadFile, 'utf-8'))
    fs.writeFileSync(leadFile, JSON.stringify({ ...full, ...req.body }, null, 2))
  }

  res.json(leads[idx])
})

// Agent events (last N hours)
app.get('/api/events', (req, res) => {
  const hours = Number(req.query.hours) || 24
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString()
  const events = readJSONL('agent-events.jsonl').filter((e: any) => e.ts >= cutoff)
  res.json(events)
})

// Pipeline stats
app.get('/api/stats', (_req, res) => {
  const all = readJSON('master-sheet.json') || []
  const leads = all.filter((l: any) => l.type !== 'client')
  const clients = all.filter((l: any) => l.type === 'client')

  const byScore: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const l of leads) {
    byScore[l.score] = (byScore[l.score] || 0) + 1
    byStatus[l.status] = (byStatus[l.status] || 0) + 1
  }

  const clientsByTier: Record<string, number> = {}
  const clientsByStatus: Record<string, number> = {}
  for (const c of clients) {
    const tier = c.client_tier || 'unknown'
    clientsByTier[tier] = (clientsByTier[tier] || 0) + 1
    const cs = c.client_status || 'active'
    clientsByStatus[cs] = (clientsByStatus[cs] || 0) + 1
  }

  // Agent health from events
  const now = Date.now()
  const events = readJSONL('agent-events.jsonl')
  const agents = ['gc-lead-intake', 'gc-email-responder', 'gc-appointment-setter', 'gc-post-call', 'gc-crm-morning', 'gc-crm-evening', 'gc-qa-health']
  const agentHealth: Record<string, any> = {}

  for (const agent of agents) {
    const runs = events.filter((e: any) => e.from === agent && e.type === 'run_summary')
    const last = runs[runs.length - 1]
    const runsToday = runs.filter((e: any) => {
      const d = new Date(e.ts)
      const today = new Date()
      return d.toDateString() === today.toDateString()
    }).length

    agentHealth[agent] = {
      lastRun: last?.ts || null,
      runsToday,
      status: last ? (now - new Date(last.ts).getTime() < 86400000 ? 'ok' : 'stale') : 'never'
    }
  }

  // Count proposals more broadly — status=proposal_sent OR last_action/notes mention proposal/pricing sent
  const proposalKeywords = ['proposal sent', 'proposal delivered', 'pricing sent', 'engagement letter', 'sent proposal', 'sent pricing', 'payment link']
  const proposalsOut = all.filter((l: any) => {
    if (l.status === 'proposal_sent') return true
    const combined = ((l.last_action || '') + ' ' + (l.notes || '')).toLowerCase()
    return proposalKeywords.some(kw => combined.includes(kw))
  }).length

  res.json({
    total: all.length,
    totalLeads: leads.length,
    totalClients: clients.length,
    byScore,
    byStatus,
    clientsByTier,
    clientsByStatus,
    agentHealth,
    proposalsOut,
    recentLeads: leads.filter((l: any) => l.status !== 'paid').slice(-5).reverse(),
    recentClients: clients.slice(-5).reverse()
  })
})

// Clients only
app.get('/api/clients', (_req, res) => {
  const all = readJSON('master-sheet.json') || []
  res.json(all.filter((l: any) => l.type === 'client'))
})

// Leads only (excludes clients)
app.get('/api/leads-only', (_req, res) => {
  const all = readJSON('master-sheet.json') || []
  res.json(all.filter((l: any) => l.type !== 'client'))
})

// Daily reports
app.get('/api/reports/:type', (req, res) => {
  const today = new Date().toISOString().slice(0, 10)
  const type = req.params.type // 'morning', 'evening', 'qa'
  const date = (req.query.date as string) || today

  const report = readReport('daily', `${date}-${type}.md`)
  if (!report) return res.status(404).json({ error: 'Report not found' })
  res.json({ date, type, content: report })
})

// List available reports
app.get('/api/reports', (_req, res) => {
  try {
    const dailyDir = path.join(DATA_DIR, 'reports', 'daily')
    const weeklyDir = path.join(DATA_DIR, 'reports', 'weekly')
    const daily = fs.existsSync(dailyDir) ? fs.readdirSync(dailyDir).filter(f => f.endsWith('.md')).sort().reverse() : []
    const weekly = fs.existsSync(weeklyDir) ? fs.readdirSync(weeklyDir).filter(f => f.endsWith('.md')).sort().reverse() : []
    res.json({ daily, weekly })
  } catch { res.json({ daily: [], weekly: [] }) }
})

// Config (read-only, redacted)
app.get('/api/config', (_req, res) => {
  const config = readJSON('config.json')
  if (config?.operator?.phone) config.operator.phone = '***'
  res.json(config)
})

// Proposals list
app.get('/api/proposals', (_req, res) => {
  try {
    const dir = path.join(DATA_DIR, 'proposals')
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse() : []
    const proposals = files.map(f => ({
      filename: f,
      content: fs.readFileSync(path.join(dir, f), 'utf-8')
    }))
    res.json(proposals)
  } catch { res.json([]) }
})

// Today's calls (cached from calendar)
app.get('/api/calls', (_req, res) => {
  const calls = readJSON('today-calls.json')
  if (!calls) return res.json({ today: [], tomorrow: [], this_week: [], generated_at: null })
  res.json(calls)
})

// --- Stripe Revenue API ---
const config = readJSON('config.json')
const stripeKey = process.env.STRIPE_API_KEY || config?.stripe?.api_key
const stripe = stripeKey ? new Stripe(stripeKey, {
  telemetry: false,
  timeout: isVercelEnv ? 25000 : 80000, // 25s on Vercel (fits in 60s function), 80s local
  maxNetworkRetries: isVercelEnv ? 1 : 2, // Fewer retries on Vercel to stay within timeout
}) : null

// Stripe data cache — disk-backed, refreshes every 30 minutes
const CACHE_FILE = path.join(DATA_DIR, 'stripe-cache.json')
const CACHE_TTL = 30 * 60 * 1000

function loadDiskCache(): { charges: any[]; fetchedAt: number } | null {
  if (isVercelEnv) return null // Vercel filesystem is read-only
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8')
    const data = JSON.parse(raw)
    if (data?.fetchedAt && (Date.now() - data.fetchedAt) < CACHE_TTL) return data
  } catch {}
  return null
}

function saveDiskCache(charges: any[]) {
  if (isVercelEnv) return // Can't write to disk on Vercel
  const data = { charges, fetchedAt: Date.now() }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data))
}

let memCache: { charges: any[]; fetchedAt: number } | null = null
let fetchInProgress: Promise<any[]> | null = null // Prevent concurrent fetches

async function fetchAllCharges(since: Date) {
  if (!stripe) return []

  // Check memory cache first, then disk
  if (!memCache) memCache = loadDiskCache()
  if (memCache && (Date.now() - memCache.fetchedAt) < CACHE_TTL) {
    const cutoff = Math.floor(since.getTime() / 1000)
    return memCache.charges.filter(c => c.created >= cutoff)
  }

  // Prevent concurrent fetches (race between warmup and request on Vercel)
  if (fetchInProgress) {
    const result = await fetchInProgress
    const cutoff = Math.floor(since.getTime() / 1000)
    return result.filter(c => c.created >= cutoff)
  }

  const doFetch = async () => {
    console.log('Stripe: fetching charges from API...')
    const allCharges: any[] = []
    let hasMore = true
    let startingAfter: string | undefined
    // On Vercel, fetch fewer months to stay within timeout
    const lookbackMonths = isVercelEnv ? 6 : 12
    const lookbackDate = new Date()
    lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths)

    while (hasMore) {
      const params: any = { limit: 100, created: { gte: Math.floor(lookbackDate.getTime() / 1000) } }
      if (startingAfter) params.starting_after = startingAfter
      const batch = await stripe!.charges.list(params)
      allCharges.push(...batch.data.filter((c: any) => c.status === 'succeeded'))
      hasMore = batch.has_more
      if (batch.data.length > 0) startingAfter = batch.data[batch.data.length - 1].id
    }

    memCache = { charges: allCharges, fetchedAt: Date.now() }
    saveDiskCache(allCharges)
    console.log(`Stripe: cached ${allCharges.length} charges`)
    return allCharges
  }

  fetchInProgress = doFetch()
  try {
    const allCharges = await fetchInProgress
    const cutoff = Math.floor(since.getTime() / 1000)
    return allCharges.filter(c => c.created >= cutoff)
  } finally {
    fetchInProgress = null
  }
}

// Pre-warm the cache on startup — skip on Vercel (cold start budget is precious)
if (!isVercelEnv) {
  if (stripe && !loadDiskCache()) {
    const warmup = new Date()
    warmup.setMonth(warmup.getMonth() - 12)
    fetchAllCharges(warmup).catch(() => {})
  } else if (stripe) {
    memCache = loadDiskCache()
    console.log(`Stripe: loaded ${memCache?.charges?.length || 0} charges from disk cache`)
  }
}

// Helper: cross-reference Stripe customer with master-sheet
function matchStripeToClient(email: string, name: string, masterSheet: any[]) {
  if (!email && !name) return null
  const emailLower = (email || '').toLowerCase()
  const nameLower = (name || '').toLowerCase()
  return masterSheet.find((l: any) => {
    if (emailLower && l.email && l.email.toLowerCase() === emailLower) return true
    if (nameLower && l.name && l.name.toLowerCase() === nameLower) return true
    return false
  }) || null
}

app.get('/api/revenue', async (_req, res) => {
  if (!stripe) return res.json({ enabled: false })

  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)

    const allCharges = await fetchAllCharges(twelveMonthsAgo)
    const masterSheet = readJSON('master-sheet.json') || []

    // Monthly revenue breakdown (last 13 months)
    const monthlyRevenue: Record<string, { revenue: number; count: number }> = {}
    for (const c of allCharges) {
      const d = new Date(c.created * 1000)
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      if (!monthlyRevenue[key]) monthlyRevenue[key] = { revenue: 0, count: 0 }
      monthlyRevenue[key].revenue += c.amount / 100
      monthlyRevenue[key].count++
    }

    // This month / last month
    const thisMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
    const lastMonthKey = startOfLastMonth.getFullYear() + '-' + String(startOfLastMonth.getMonth() + 1).padStart(2, '0')
    const thisMonth = monthlyRevenue[thisMonthKey]?.revenue || 0
    const lastMonth = monthlyRevenue[lastMonthKey]?.revenue || 0

    // YTD
    const yearStart = now.getFullYear() + '-01'
    const ytd = Object.entries(monthlyRevenue)
      .filter(([k]) => k >= yearStart)
      .reduce((sum, [, v]) => sum + v.revenue, 0)

    // Daily revenue (this month)
    const thisMonthCharges = allCharges.filter(c => c.created >= Math.floor(startOfMonth.getTime() / 1000))
    const dailyRevenue: Record<string, number> = {}
    for (const c of thisMonthCharges) {
      const day = new Date(c.created * 1000).toISOString().slice(0, 10)
      dailyRevenue[day] = (dailyRevenue[day] || 0) + c.amount / 100
    }

    // Recent transactions with client cross-reference
    const recentTransactions = allCharges.slice(0, 30).map((c: any) => {
      const email = c.billing_details?.email || c.receipt_email || ''
      const name = c.billing_details?.name || ''
      const match = matchStripeToClient(email, name, masterSheet)
      return {
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency,
        description: c.description || c.metadata?.product || c.metadata?.memberpress_product || 'Payment',
        customer_email: email,
        customer_name: name,
        date: new Date(c.created * 1000).toISOString(),
        status: c.status,
        client_match: match ? { id: match.id, name: match.name, type: match.type, score: match.score, client_tier: match.client_tier } : null,
        platform: c.metadata?.platform || c.metadata?.site_url || null,
      }
    })

    // Product/description grouping
    const productGroups: Record<string, { name: string; count: number; total: number; customers: string[] }> = {}
    for (const c of allCharges) {
      const rawDesc = c.description || c.metadata?.memberpress_product || c.metadata?.product || 'Other'
      // Normalize description
      let group = rawDesc
      if (/subscription (update|creation)/i.test(rawDesc)) group = 'Mighty Networks / Subscription'
      else if (/ai tools.*crm.*research/i.test(rawDesc)) group = 'AI Tools + CRM + Research'
      else if (/ai tools/i.test(rawDesc)) group = 'AI Tools'
      if (!productGroups[group]) productGroups[group] = { name: group, count: 0, total: 0, customers: [] }
      productGroups[group].count++
      productGroups[group].total += c.amount / 100
      const custName = c.billing_details?.name || c.receipt_email || 'Unknown'
      if (!productGroups[group].customers.includes(custName)) productGroups[group].customers.push(custName)
    }

    const mom = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth * 100).toFixed(1) : null

    res.json({
      enabled: true,
      thisMonth,
      lastMonth,
      ytd,
      transactionCount: thisMonthCharges.length,
      totalCharges: allCharges.length,
      recentTransactions,
      dailyRevenue,
      monthlyRevenue: Object.entries(monthlyRevenue).sort().map(([month, data]) => ({ month, ...data })),
      productGroups: Object.values(productGroups).sort((a, b) => b.total - a.total),
      monthOverMonth: mom,
    })
  } catch (err: any) {
    console.error('Stripe error:', err.message, err.type || '', err.statusCode || '')
    const userMessage = err.type === 'StripeConnectionError'
      ? 'Stripe connection timed out. Try refreshing in a moment.'
      : err.type === 'StripePermissionError'
      ? 'Stripe API key lacks required permissions. Check key settings in Stripe Dashboard.'
      : err.message
    res.status(500).json({ enabled: true, error: userMessage })
  }
})

// Active subscriptions with product info & client cross-reference
app.get('/api/subscriptions', async (_req, res) => {
  if (!stripe) return res.json({ enabled: false })

  try {
    const masterSheet = readJSON('master-sheet.json') || []

    // Fetch all subs (active + past_due)
    // Expand customer inline, fetch products separately
    const [activeSubs, pastDueSubs] = await Promise.all([
      stripe.subscriptions.list({ limit: 100, status: 'active', expand: ['data.customer'] }),
      stripe.subscriptions.list({ limit: 100, status: 'past_due', expand: ['data.customer'] }),
    ])
    const allSubs = [...activeSubs.data, ...pastDueSubs.data]

    // Batch-fetch product names
    const productIds = [...new Set(allSubs.map(s => s.items.data[0]?.price?.product as string).filter(Boolean))]
    const productNames: Record<string, string> = {}
    // Fetch in batches of 10 to avoid rate limits
    for (let i = 0; i < productIds.length; i += 10) {
      const batch = productIds.slice(i, i + 10)
      await Promise.all(batch.map(async (pid) => {
        try { const p = await stripe!.products.retrieve(pid); productNames[pid] = p.name } catch { productNames[pid] = pid }
      }))
    }

    const planGroups: Record<string, { name: string; price: number; interval: string; members: any[]; mrr: number }> = {}

    let totalMrr = 0
    const subscriptions = allSubs.map((s) => {
      const item = s.items.data[0]
      const amount = item?.price?.unit_amount ? item.price.unit_amount / 100 : 0
      const interval = item?.price?.recurring?.interval || 'month'

      const prodId = item?.price?.product as string
      const productName = productNames[prodId] || prodId || 'Unknown'

      let monthlyAmount = amount
      if (interval === 'year') monthlyAmount = amount / 12
      if (s.status === 'active') totalMrr += monthlyAmount

      // Customer from expanded object
      const custObj = s.customer
      const custEmail = (typeof custObj === 'object' && custObj !== null && !(custObj as any).deleted) ? (custObj as any).email || '' : ''
      const custName = (typeof custObj === 'object' && custObj !== null && !(custObj as any).deleted) ? (custObj as any).name || '' : ''
      const match = matchStripeToClient(custEmail, custName, masterSheet)

      // Group by price tier instead of individual product
      let tierName: string
      let tierOrder: number
      const monthlyEquiv = interval === 'year' ? amount / 12 : amount
      if (amount === 9 || (interval === 'month' && amount === 9)) { tierName = 'Community Plan'; tierOrder = 1 }
      else if (amount === 27 || (interval === 'month' && amount === 27)) { tierName = 'Starter Plan'; tierOrder = 2 }
      else if (amount === 99 || (interval === 'month' && amount === 99)) { tierName = 'Pro Member Group'; tierOrder = 3 }
      else if (amount === 249 || (interval === 'month' && amount === 249)) { tierName = 'Ongoing Coaching'; tierOrder = 4 }
      else if (amount === 497 || (interval === 'month' && amount === 497)) { tierName = 'Market Intelligence'; tierOrder = 5 }
      else if (interval === 'year' && amount <= 999) { tierName = 'Pro Member (Annual)'; tierOrder = 6 }
      else if (interval === 'year' && amount > 999) { tierName = 'Pro Member Lifetime'; tierOrder = 7 }
      else if (amount >= 4000) { tierName = 'White Glove BD'; tierOrder = 8 }
      else { tierName = productName; tierOrder = 9 }

      const groupKey = `${tierOrder}__${tierName}`
      if (!planGroups[groupKey]) planGroups[groupKey] = { name: tierName, price: amount, interval, members: [], mrr: 0 }
      planGroups[groupKey].members.push({ name: custName || custEmail || s.id, email: custEmail, status: s.status, client_match: match?.name || null })
      if (s.status === 'active') planGroups[groupKey].mrr += monthlyAmount

      let periodEnd: string | null = null
      try {
        const raw = (s as any).current_period_end
        if (typeof raw === 'number') periodEnd = new Date(raw * 1000).toISOString()
      } catch {}

      return {
        id: s.id,
        customer_name: custName,
        customer_email: custEmail,
        status: s.status,
        amount,
        interval,
        product: productName,
        current_period_end: periodEnd,
        client_match: match ? { id: match.id, name: match.name, type: match.type, client_tier: match.client_tier } : null,
      }
    })

    res.json({
      enabled: true,
      mrr: Math.round(totalMrr * 100) / 100,
      activeCount: activeSubs.data.length,
      pastDueCount: pastDueSubs.data.length,
      subscriptions,
      planGroups: Object.entries(planGroups).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v),
    })
  } catch (err: any) {
    console.error('Stripe subs error:', err.message, err.type || '', err.statusCode || '')
    const userMessage = err.type === 'StripeConnectionError'
      ? 'Stripe connection timed out. Try refreshing in a moment.'
      : err.type === 'StripePermissionError'
      ? 'Stripe API key lacks required permissions. Check key settings in Stripe Dashboard.'
      : err.message
    res.status(500).json({ enabled: true, error: userMessage })
  }
})

// Cross-reference: find Stripe payers who aren't marked as clients
app.get('/api/stripe-crossref', async (_req, res) => {
  if (!stripe) return res.json({ enabled: false })
  try {
    const now = new Date()
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)
    const allCharges = await fetchAllCharges(twelveMonthsAgo)
    const masterSheet = readJSON('master-sheet.json') || []

    // Build map of all Stripe payers
    const payers: Record<string, { name: string; email: string; total: number; count: number; lastPayment: string }> = {}
    for (const c of allCharges) {
      const email = (c.billing_details?.email || c.receipt_email || '').toLowerCase()
      const name = c.billing_details?.name || ''
      const key = email || name.toLowerCase()
      if (!key) continue
      if (!payers[key]) payers[key] = { name, email, total: 0, count: 0, lastPayment: '' }
      payers[key].total += c.amount / 100
      payers[key].count++
      const dt = new Date(c.created * 1000).toISOString()
      if (dt > payers[key].lastPayment) payers[key].lastPayment = dt
      if (name && !payers[key].name) payers[key].name = name
    }

    // Check each payer against master sheet
    const missingClients: any[] = []
    const matchedAsLead: any[] = []
    const matchedAsClient: any[] = []

    for (const [, payer] of Object.entries(payers)) {
      const match = matchStripeToClient(payer.email, payer.name, masterSheet)
      if (!match) {
        missingClients.push({ ...payer, status: 'not_in_crm' })
      } else if (match.type !== 'client') {
        matchedAsLead.push({ ...payer, lead: { id: match.id, name: match.name, score: match.score, status: match.status } })
      } else {
        matchedAsClient.push({ ...payer, client: { id: match.id, name: match.name, tier: match.client_tier } })
      }
    }

    res.json({
      enabled: true,
      summary: {
        totalPayers: Object.keys(payers).length,
        matchedAsClient: matchedAsClient.length,
        matchedAsLead: matchedAsLead.length,
        notInCrm: missingClients.length,
      },
      needsUpgrade: matchedAsLead.sort((a, b) => b.total - a.total),
      missingFromCrm: missingClients.sort((a, b) => b.total - a.total),
      confirmedClients: matchedAsClient.sort((a, b) => b.total - a.total),
    })
  } catch (err: any) {
    res.status(500).json({ enabled: true, error: err.message })
  }
})

// Upgrade leads to clients based on Stripe payments
app.post('/api/stripe-crossref/upgrade', express.json(), (req, res) => {
  if (isVercelEnv) return res.status(403).json({ error: 'Write operations disabled in production. Use local server.' })
  const { leadIds } = req.body
  if (!leadIds?.length) return res.status(400).json({ error: 'No leadIds provided' })

  const masterSheet = readJSON('master-sheet.json') || []
  let upgraded = 0
  for (const id of leadIds) {
    const lead = masterSheet.find((l: any) => l.id === id)
    if (lead && lead.type !== 'client') {
      lead.type = 'client'
      lead.status = 'paid'
      lead.client_status = 'active'
      lead.client_tier = lead.client_tier || 'unknown'
      lead.last_action = 'Upgraded to client via Stripe cross-reference'
      lead.last_action_date = new Date().toISOString()
      upgraded++
    }
  }

  if (upgraded > 0) {
    fs.writeFileSync(path.join(DATA_DIR, 'master-sheet.json'), JSON.stringify(masterSheet, null, 2))
  }

  res.json({ upgraded, total: leadIds.length })
})

// Searchable transaction history (full year)
app.get('/api/transactions', async (req, res) => {
  if (!stripe) return res.json({ enabled: false })
  try {
    const now = new Date()
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)
    const allCharges = await fetchAllCharges(twelveMonthsAgo)
    const masterSheet = readJSON('master-sheet.json') || []

    const q = ((req.query.q as string) || '').toLowerCase()
    const transactions = allCharges.map((c: any) => {
      const email = c.billing_details?.email || c.receipt_email || ''
      const name = c.billing_details?.name || ''
      const desc = c.description || c.metadata?.memberpress_product || c.metadata?.product || ''
      const match = matchStripeToClient(email, name, masterSheet)
      return {
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency,
        description: desc,
        customer_email: email,
        customer_name: name,
        date: new Date(c.created * 1000).toISOString(),
        client_match: match ? { id: match.id, name: match.name, type: match.type, score: match.score, client_tier: match.client_tier, status: match.status } : null,
        platform: c.metadata?.platform || c.metadata?.site_url || null,
      }
    })

    const filtered = q
      ? transactions.filter(t =>
          t.customer_name.toLowerCase().includes(q) ||
          t.customer_email.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.client_match?.name || '').toLowerCase().includes(q))
      : transactions

    res.json({ enabled: true, total: transactions.length, results: filtered })
  } catch (err: any) {
    res.status(500).json({ enabled: true, error: err.message })
  }
})

// Revenue report endpoint
app.get('/api/revenue/report', async (_req, res) => {
  if (!stripe) return res.json({ enabled: false })

  try {
    const now = new Date()
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)
    const allCharges = await fetchAllCharges(twelveMonthsAgo)
    const masterSheet = readJSON('master-sheet.json') || []

    const activeSubs = await stripe.subscriptions.list({ limit: 100, status: 'active' })

    // Monthly breakdown
    const monthly: Record<string, { revenue: number; count: number }> = {}
    for (const c of allCharges) {
      const d = new Date(c.created * 1000)
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      if (!monthly[key]) monthly[key] = { revenue: 0, count: 0 }
      monthly[key].revenue += c.amount / 100
      monthly[key].count++
    }

    // MRR
    let mrr = 0
    for (const s of activeSubs.data) {
      const item = s.items.data[0]
      const amount = item?.price?.unit_amount ? item.price.unit_amount / 100 : 0
      const interval = item?.price?.recurring?.interval || 'month'
      mrr += interval === 'year' ? amount / 12 : amount
    }

    const sortedMonths = Object.entries(monthly).sort()
    const currentMonth = sortedMonths[sortedMonths.length - 1]
    const prevMonth = sortedMonths[sortedMonths.length - 2]
    const ytd = sortedMonths.filter(([k]) => k.startsWith(String(now.getFullYear()))).reduce((s, [, v]) => s + v.revenue, 0)

    // Top customers
    const customerTotals: Record<string, { name: string; email: string; total: number; count: number }> = {}
    for (const c of allCharges) {
      const email = c.billing_details?.email || c.receipt_email || ''
      const name = c.billing_details?.name || email || 'Unknown'
      const key = email || name
      if (!customerTotals[key]) customerTotals[key] = { name, email, total: 0, count: 0 }
      customerTotals[key].total += c.amount / 100
      customerTotals[key].count++
    }

    const topCustomers = Object.values(customerTotals).sort((a, b) => b.total - a.total).slice(0, 10)

    // Growth rates
    const growthData = sortedMonths.map(([month, data], i) => {
      const prev = i > 0 ? sortedMonths[i - 1][1].revenue : 0
      return { month, revenue: data.revenue, count: data.count, growth: prev > 0 ? ((data.revenue - prev) / prev * 100).toFixed(1) + '%' : 'N/A' }
    })

    const report = {
      generated: now.toISOString(),
      summary: {
        thisMonth: currentMonth ? { month: currentMonth[0], revenue: currentMonth[1].revenue, transactions: currentMonth[1].count } : null,
        lastMonth: prevMonth ? { month: prevMonth[0], revenue: prevMonth[1].revenue, transactions: prevMonth[1].count } : null,
        ytd,
        mrr: Math.round(mrr * 100) / 100,
        activeSubscriptions: activeSubs.data.length,
        totalTransactions: allCharges.length,
        avgTransactionValue: allCharges.length > 0 ? Math.round(allCharges.reduce((s, c) => s + c.amount / 100, 0) / allCharges.length) : 0,
      },
      monthlyTrend: growthData,
      topCustomers,
      clientMatches: topCustomers.map(tc => {
        const match = matchStripeToClient(tc.email, tc.name, masterSheet)
        return { ...tc, client_match: match ? { name: match.name, type: match.type, tier: match.client_tier, status: match.client_status } : null }
      }),
    }

    res.json({ enabled: true, report })
  } catch (err: any) {
    res.status(500).json({ enabled: true, error: err.message })
  }
})

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// Export for Vercel serverless
export default app

// Only start listening when run directly (not imported by Vercel)
const isVercel = process.env.VERCEL === '1'
if (!isVercel) {
  app.listen(PORT, () => console.log(`Sales Dashboard API running on port ${PORT}`))
}

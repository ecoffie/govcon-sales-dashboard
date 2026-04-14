import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, TrendingDown, CreditCard, RefreshCw, ArrowUpRight, Users, FileText, Search, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface RevenueData {
  enabled: boolean
  thisMonth: number
  lastMonth: number
  ytd: number
  transactionCount: number
  totalCharges: number
  monthOverMonth: string | null
  recentTransactions: Transaction[]
  dailyRevenue: Record<string, number>
  monthlyRevenue: { month: string; revenue: number; count: number }[]
  productGroups: ProductGroup[]
  error?: string
}

interface SubsData {
  enabled: boolean
  mrr: number
  activeCount: number
  pastDueCount: number
  subscriptions: Subscription[]
  planGroups: PlanGroup[]
  error?: string
}

interface ReportData {
  enabled: boolean
  report: {
    generated: string
    summary: any
    monthlyTrend: any[]
    topCustomers: any[]
    clientMatches: any[]
  }
  error?: string
}

interface Transaction {
  id: string; amount: number; currency: string; description: string
  customer_email: string; customer_name: string; date: string; status: string
  client_match: { id: string; name: string; type: string; score: string; client_tier: string } | null
  platform: string | null
}

interface Subscription {
  id: string; customer_name: string; customer_email: string; status: string
  amount: number; interval: string; product: string; current_period_end: string
  client_match: { id: string; name: string; type: string; client_tier: string } | null
}

interface ProductGroup {
  name: string; count: number; total: number; customers: string[]
}

interface PlanGroup {
  name: string; price: number; interval: string; mrr: number
  members: { name: string; email: string; status: string; client_match: string | null }[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}
function fmtFull(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}
function monthLabel(m: string) {
  const [y, mo] = m.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return months[parseInt(mo) - 1] + ' ' + y.slice(2)
}

export default function Revenue() {
  const [revenue, setRevenue] = useState<RevenueData | null>(null)
  const [subs, setSubs] = useState<SubsData | null>(null)
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showReport, setShowReport] = useState(false)
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null)
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)

  // Transaction search
  const [txSearch, setTxSearch] = useState('')
  const [txResults, setTxResults] = useState<any[] | null>(null)
  const [txTotal, setTxTotal] = useState(0)
  const [txLoading, setTxLoading] = useState(false)

  // Cross-reference
  const [crossRef, setCrossRef] = useState<any>(null)
  const [showCrossRef, setShowCrossRef] = useState(false)
  const [upgrading, setUpgrading] = useState<string[]>([])

  const load = () => {
    setLoading(true)
    fetch('/api/revenue').then(r => r.json()).then(rev => { setRevenue(rev); setLoading(false) }).catch(() => setLoading(false))
    fetch('/api/subscriptions').then(r => r.json()).then(setSubs).catch(() => {})
  }

  const loadReport = () => {
    setShowReport(true)
    if (!report) {
      fetch('/api/revenue/report').then(r => r.json()).then(setReport).catch(() => {})
    }
  }

  const searchTransactions = (q: string) => {
    setTxSearch(q)
    setTxLoading(true)
    fetch(`/api/transactions?q=${encodeURIComponent(q)}`).then(r => r.json()).then(data => {
      setTxResults(data.results || [])
      setTxTotal(data.total || 0)
      setTxLoading(false)
    }).catch(() => setTxLoading(false))
  }

  const loadCrossRef = () => {
    setShowCrossRef(true)
    if (!crossRef) {
      fetch('/api/stripe-crossref').then(r => r.json()).then(setCrossRef).catch(() => {})
    }
  }

  const upgradeLead = (leadId: string) => {
    setUpgrading(prev => [...prev, leadId])
    fetch('/api/stripe-crossref/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadIds: [leadId] }),
    }).then(r => r.json()).then(() => {
      setCrossRef(null)
      fetch('/api/stripe-crossref').then(r => r.json()).then(setCrossRef)
      setUpgrading(prev => prev.filter(id => id !== leadId))
    }).catch(() => setUpgrading(prev => prev.filter(id => id !== leadId)))
  }

  const upgradeAll = (leadIds: string[]) => {
    setUpgrading(leadIds)
    fetch('/api/stripe-crossref/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadIds }),
    }).then(r => r.json()).then(() => {
      setCrossRef(null)
      fetch('/api/stripe-crossref').then(r => r.json()).then(setCrossRef)
      setUpgrading([])
    }).catch(() => setUpgrading([]))
  }

  useEffect(() => { load() }, [])

  if (loading && !revenue) return <div className="p-8 text-gray-400">Loading Stripe data...</div>

  if (revenue?.error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h3 className="text-red-800 font-semibold mb-2">Stripe Connection Error</h3>
          <p className="text-red-600 text-sm">{revenue.error}</p>
        </div>
      </div>
    )
  }

  if (!revenue?.enabled) {
    return <div className="p-8"><div className="bg-gray-50 border rounded-xl p-6 text-center"><p className="text-gray-500">Stripe not configured</p></div></div>
  }

  const mom = revenue.monthOverMonth ? parseFloat(revenue.monthOverMonth) : null
  const momPositive = mom !== null && mom >= 0

  // Chart data
  const dailyChartData = Object.entries(revenue.dailyRevenue || {})
    .map(([date, amount]) => ({ date: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), amount }))

  const monthlyChartData = (revenue.monthlyRevenue || []).map(m => ({
    month: monthLabel(m.month),
    revenue: Math.round(m.revenue),
    transactions: m.count,
  }))

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Revenue</h2>
        <div className="flex items-center gap-3">
          <button onClick={loadReport} className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700">
            <FileText className="w-4 h-4" /> Executive Report
          </button>
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard icon={DollarSign} label="This Month" value={fmt(revenue.thisMonth)} color="green"
          sub={mom !== null ? <span className={`flex items-center gap-0.5 text-xs ${momPositive ? 'text-green-600' : 'text-red-500'}`}>
            {momPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} {momPositive ? '+' : ''}{revenue.monthOverMonth}%
          </span> : undefined} />
        <MetricCard icon={DollarSign} label="Last Month" value={fmt(revenue.lastMonth)} color="blue" />
        <MetricCard icon={TrendingUp} label="Year to Date" value={fmt(revenue.ytd)} color="purple" />
        <MetricCard icon={CreditCard} label="MRR" value={subs?.mrr ? fmt(subs.mrr) : '$0'} color="amber"
          sub={subs?.activeCount ? <span className="text-xs text-gray-400">{subs.activeCount} active subs</span> : undefined} />
        <MetricCard icon={Users} label="Transactions" value={String(revenue.totalCharges)} color="slate"
          sub={<span className="text-xs text-gray-400">{revenue.transactionCount} this month</span>} />
      </div>

      {/* 12-Month Revenue Trend */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Revenue Trend (12 Months)</h3>
        <p className="text-xs text-gray-400 mb-4">Monthly revenue with growth/decline indicators</p>
        {monthlyChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number, name: string) => [name === 'revenue' ? fmtFull(v) : v, name === 'revenue' ? 'Revenue' : 'Transactions']} />
              <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">No data</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Revenue (This Month) */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Daily Revenue (This Month)</h3>
          {dailyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyChartData}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v: number) => fmtFull(v)} />
                <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">No revenue this month yet</div>}
        </div>

        {/* Revenue by Product */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue by Product</h3>
          <div className="space-y-2 max-h-[260px] overflow-y-auto">
            {revenue.productGroups.map(pg => (
              <div key={pg.name} className="border rounded-lg">
                <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedProduct(expandedProduct === pg.name ? null : pg.name)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{pg.name}</p>
                    <p className="text-xs text-gray-400">{pg.customers.length} customers &middot; {pg.count} charges</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-green-600">{fmt(pg.total)}</span>
                    {expandedProduct === pg.name ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                  </div>
                </div>
                {expandedProduct === pg.name && (
                  <div className="px-3 pb-2 border-t">
                    <div className="flex flex-wrap gap-1 mt-2">
                      {pg.customers.map(c => <span key={c} className="text-xs bg-gray-100 px-2 py-0.5 rounded">{c}</span>)}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Subscription Plans */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Subscription Plans</h3>
            <p className="text-xs text-gray-400">{subs?.activeCount || 0} active &middot; {subs?.pastDueCount || 0} past due &middot; {subs?.mrr ? fmt(subs.mrr) : '$0'} MRR</p>
          </div>
        </div>
        {subs?.planGroups && subs.planGroups.length > 0 ? (
          <div className="space-y-2">
            {subs.planGroups.map(pg => {
              const key = `${pg.name}__${pg.price}__${pg.interval}`
              const isExpanded = expandedPlan === key
              const activeMembers = pg.members.filter(m => m.status === 'active')
              const pastDue = pg.members.filter(m => m.status === 'past_due')
              return (
                <div key={key} className="border rounded-lg">
                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedPlan(isExpanded ? null : key)}>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{pg.name}</p>
                      <p className="text-xs text-gray-400">{fmtFull(pg.price)}/{pg.interval}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-lg font-bold text-gray-900">{pg.members.length}</span>
                        <span className="text-xs text-gray-400 ml-1">members</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-green-600">{fmt(pg.mrr)}</span>
                        <span className="text-xs text-gray-400 ml-1">/mo</span>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t px-4 py-3">
                      {pastDue.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600 mb-2">
                          <AlertCircle className="w-3 h-3" /> {pastDue.length} past due
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {pg.members.map((m, i) => (
                          <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${m.status === 'past_due' ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'active' ? 'bg-green-500' : 'bg-amber-500'}`} />
                            <span className="font-medium truncate">{m.name || m.email || 'Unknown'}</span>
                            {m.client_match && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">CLIENT</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : <div className="text-center text-gray-400 text-sm py-8">No subscriptions found</div>}
      </div>

      {/* Transaction Search */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Transaction History</h3>
            <p className="text-xs text-gray-400">Search all {revenue.totalCharges} transactions from the past year</p>
          </div>
          <button onClick={loadCrossRef} className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100">
            <Users className="w-3 h-3" /> Cross-Reference Clients
          </button>
        </div>
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name, email, or description..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            value={txSearch}
            onChange={e => searchTransactions(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">Customer</th>
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium">CRM Match</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {(txResults || revenue.recentTransactions).slice(0, 100).map((tx: any) => (
                <tr key={tx.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2">
                    <p className="font-medium text-gray-800 text-xs">{tx.customer_name || tx.customer_email || 'Customer'}</p>
                    {tx.customer_name && tx.customer_email && <p className="text-[10px] text-gray-400">{tx.customer_email}</p>}
                  </td>
                  <td className="py-2 text-xs text-gray-600 max-w-[200px] truncate">{tx.description || 'Payment'}</td>
                  <td className="py-2">
                    {tx.client_match ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${tx.client_match.type === 'client' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {tx.client_match.type === 'client' ? `CLIENT` : `LEAD - ${tx.client_match.score}`}
                      </span>
                    ) : <span className="text-[10px] text-gray-300">No match</span>}
                  </td>
                  <td className="py-2 text-right font-semibold text-green-600 text-xs">{fmtFull(tx.amount)}</td>
                  <td className="py-2 text-right text-gray-500 text-xs whitespace-nowrap">
                    {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                  </td>
                </tr>
              ))}
              {txResults && txResults.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-gray-400 text-sm">No transactions match "{txSearch}"</td></tr>
              )}
            </tbody>
          </table>
          {txResults && txResults.length > 100 && (
            <p className="text-xs text-gray-400 mt-2 text-center">Showing first 100 of {txResults.length} results</p>
          )}
        </div>
      </div>

      {/* Cross-Reference Modal */}
      {showCrossRef && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCrossRef(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Stripe / CRM Cross-Reference</h2>
                <p className="text-xs text-gray-400">Find paying customers who should be marked as clients</p>
              </div>
              <button onClick={() => setShowCrossRef(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            {!crossRef ? (
              <div className="p-12 text-center text-gray-400">Analyzing...</div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">{crossRef.summary?.totalPayers || 0}</p>
                    <p className="text-[11px] text-gray-500">Total Payers</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{crossRef.summary?.matchedAsClient || 0}</p>
                    <p className="text-[11px] text-gray-500">Confirmed Clients</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700">{crossRef.summary?.matchedAsLead || 0}</p>
                    <p className="text-[11px] text-gray-500">Leads Who Paid</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{crossRef.summary?.notInCrm || 0}</p>
                    <p className="text-[11px] text-gray-500">Not in CRM</p>
                  </div>
                </div>

                {/* Leads who paid — need upgrade */}
                {crossRef.needsUpgrade?.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-amber-700">Leads Who Paid (Should Be Clients)</h3>
                      <button
                        onClick={() => upgradeAll(crossRef.needsUpgrade.map((l: any) => l.lead.id))}
                        className="text-xs bg-amber-600 text-white px-3 py-1 rounded-lg hover:bg-amber-700"
                        disabled={upgrading.length > 0}
                      >
                        {upgrading.length > 0 ? 'Upgrading...' : `Upgrade All (${crossRef.needsUpgrade.length})`}
                      </button>
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-gray-500 border-b text-xs"><th className="pb-1">Stripe Name</th><th className="pb-1">CRM Match</th><th className="pb-1">Score</th><th className="pb-1 text-right">Total Paid</th><th className="pb-1 text-right">Action</th></tr></thead>
                      <tbody>
                        {crossRef.needsUpgrade.map((item: any) => (
                          <tr key={item.lead.id} className="border-b hover:bg-amber-50/50">
                            <td className="py-2">
                              <p className="font-medium text-xs">{item.name}</p>
                              <p className="text-[10px] text-gray-400">{item.email}</p>
                            </td>
                            <td className="py-2 text-xs">{item.lead.name}</td>
                            <td className="py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${item.lead.score === 'HOT' ? 'bg-red-100 text-red-700' : item.lead.score === 'WARM' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100'}`}>{item.lead.score}</span></td>
                            <td className="py-2 text-right font-semibold text-green-600 text-xs">{fmt(item.total)}</td>
                            <td className="py-2 text-right">
                              <button
                                onClick={() => upgradeLead(item.lead.id)}
                                disabled={upgrading.includes(item.lead.id)}
                                className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {upgrading.includes(item.lead.id) ? '...' : 'Make Client'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Not in CRM */}
                {crossRef.missingFromCrm?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-red-700 mb-3">Paying But Not in CRM</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-gray-500 border-b text-xs"><th className="pb-1">Name</th><th className="pb-1">Email</th><th className="pb-1 text-right">Payments</th><th className="pb-1 text-right">Total</th></tr></thead>
                      <tbody>
                        {crossRef.missingFromCrm.slice(0, 30).map((item: any, i: number) => (
                          <tr key={i} className="border-b hover:bg-red-50/50">
                            <td className="py-1.5 text-xs font-medium">{item.name}</td>
                            <td className="py-1.5 text-xs text-gray-500">{item.email}</td>
                            <td className="py-1.5 text-right text-xs">{item.count}</td>
                            <td className="py-1.5 text-right text-xs font-semibold text-green-600">{fmt(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {crossRef.missingFromCrm.length > 30 && <p className="text-xs text-gray-400 mt-2">+ {crossRef.missingFromCrm.length - 30} more</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Executive Report Modal */}
      {showReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowReport(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Revenue Executive Report</h2>
                <p className="text-xs text-gray-400">{report?.report?.generated ? new Date(report.report.generated).toLocaleString() : 'Generating...'}</p>
              </div>
              <button onClick={() => setShowReport(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            {!report ? (
              <div className="p-12 text-center text-gray-400">Loading report...</div>
            ) : report.error ? (
              <div className="p-6 text-red-600">{report.error}</div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Summary */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Summary</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <ReportStat label="This Month" value={fmt(report.report.summary.thisMonth?.revenue || 0)} sub={`${report.report.summary.thisMonth?.transactions || 0} transactions`} />
                    <ReportStat label="Last Month" value={fmt(report.report.summary.lastMonth?.revenue || 0)} sub={`${report.report.summary.lastMonth?.transactions || 0} transactions`} />
                    <ReportStat label="YTD Revenue" value={fmt(report.report.summary.ytd)} sub={`${report.report.summary.totalTransactions} total txns`} />
                    <ReportStat label="MRR" value={fmt(report.report.summary.mrr)} sub={`${report.report.summary.activeSubscriptions} subs`} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <ReportStat label="Avg Transaction" value={fmt(report.report.summary.avgTransactionValue)} />
                    <ReportStat label="Annual Run Rate" value={fmt(report.report.summary.mrr * 12)} sub="Based on MRR" />
                  </div>
                </div>

                {/* Monthly Trend Table */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Monthly Trend</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="pb-2 font-medium">Month</th>
                        <th className="pb-2 font-medium text-right">Revenue</th>
                        <th className="pb-2 font-medium text-right">Transactions</th>
                        <th className="pb-2 font-medium text-right">Growth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.report.monthlyTrend.map((m: any) => {
                        const g = m.growth !== 'N/A' ? parseFloat(m.growth) : null
                        return (
                          <tr key={m.month} className="border-b">
                            <td className="py-2 font-medium">{monthLabel(m.month)}</td>
                            <td className="py-2 text-right">{fmt(m.revenue)}</td>
                            <td className="py-2 text-right text-gray-500">{m.count}</td>
                            <td className={`py-2 text-right font-medium ${g === null ? 'text-gray-400' : g >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {m.growth}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Top Customers */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Top 10 Customers (12 Months)</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="pb-2 font-medium">Customer</th>
                        <th className="pb-2 font-medium">CRM Match</th>
                        <th className="pb-2 font-medium text-right">Payments</th>
                        <th className="pb-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.report.clientMatches.map((c: any, i: number) => (
                        <tr key={i} className="border-b">
                          <td className="py-2">
                            <p className="font-medium">{c.name}</p>
                            {c.email && <p className="text-xs text-gray-400">{c.email}</p>}
                          </td>
                          <td className="py-2">
                            {c.client_match ? (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${c.client_match.type === 'client' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                {c.client_match.type === 'client' ? `Client - ${c.client_match.tier || 'N/A'}` : 'Lead'}
                              </span>
                            ) : <span className="text-xs text-gray-400">No match</span>}
                          </td>
                          <td className="py-2 text-right text-gray-500">{c.count}</td>
                          <td className="py-2 text-right font-semibold text-green-600">{fmt(c.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: string; color: string; sub?: React.ReactNode }) {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
    amber: 'bg-amber-100 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
  }
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color] || colors.slate}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900">{value}</p>
          <p className="text-[11px] text-gray-500">{label}</p>
        </div>
      </div>
      {sub && <div className="mt-2">{sub}</div>}
    </div>
  )
}

function ReportStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}

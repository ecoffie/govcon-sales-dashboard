import { useEffect, useState } from 'react'
import { Users, UserCheck, Flame, Zap, Mail, Phone, FileText, CheckCircle, XCircle, Clock, AlertTriangle, DollarSign } from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface Stats {
  total: number
  totalLeads: number
  totalClients: number
  byScore: Record<string, number>
  byStatus: Record<string, number>
  clientsByTier: Record<string, number>
  clientsByStatus: Record<string, number>
  agentHealth: Record<string, { lastRun: string | null; runsToday: number; status: string }>
  recentLeads: any[]
  recentClients: any[]
  proposalsOut: number
}

const TIER_LABELS: Record<string, string> = {
  tier1_training: 'Training',
  tier2_consulting: 'Consulting',
  tier3_white_glove: 'White Glove',
  shop_tools: 'Shop Tools',
  unknown: 'Unknown',
}
const TIER_COLORS: Record<string, string> = {
  tier1_training: '#3b82f6',
  tier2_consulting: '#8b5cf6',
  tier3_white_glove: '#f59e0b',
  shop_tools: '#10b981',
  unknown: '#6b7280',
}

const SCORE_COLORS: Record<string, string> = { HOT: '#ef4444', WARM: '#f59e0b', BASIC: '#6b7280' }

const AGENT_LABELS: Record<string, string> = {
  'gc-lead-intake': 'Lead Intake',
  'gc-email-responder': 'Email Responder',
  'gc-appointment-setter': 'Appointment Setter',
  'gc-post-call': 'Post-Call',
  'gc-crm-morning': 'Morning Briefing',
  'gc-crm-evening': 'Evening Recon',
  'gc-qa-health': 'QA Health',
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  first_touch_drafted: 'First Touch',
  meeting_interest: 'Meeting Interest',
  booked: 'Booked',
  call_completed: 'Call Done',
  proposal_sent: 'Proposal Sent',
  closed_won: 'Won',
  closed_lost: 'Lost',
  no_show: 'No-Show',
  unsubscribed: 'Unsubscribed',
  paid: 'Paid',
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [reportData, setReportData] = useState<any>(null)

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {})
    const interval = setInterval(() => {
      fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {})
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const generateFullReport = () => {
    setShowReport(true)
    if (!reportData) {
      Promise.all([
        fetch('/api/stats').then(r => r.json()),
        fetch('/api/revenue/report').then(r => r.json()).catch(() => null),
        fetch('/api/subscriptions').then(r => r.json()).catch(() => null),
        fetch('/api/calls').then(r => r.json()).catch(() => null),
      ]).then(([stats, rev, subs, calls]) => {
        setReportData({ stats, revenue: rev?.report || null, subs, calls })
      })
    }
  }

  if (!stats) return <div className="p-8 text-gray-400">Loading...</div>

  const scoreData = Object.entries(stats.byScore).map(([name, value]) => ({ name, value }))
  const statusData = Object.entries(stats.byStatus)
    .map(([key, value]) => ({ name: STATUS_LABELS[key] || key, value }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Sales Dashboard</h2>
        <div className="flex items-center gap-3">
          <button onClick={generateFullReport} className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700">
            <FileText size={14} /> Full Report
          </button>
          <span className="text-sm text-gray-400">Auto-refreshes every 60s</span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard icon={Users} label="Active Leads" value={stats.totalLeads || stats.total} color="blue" />
        <MetricCard icon={Flame} label="HOT Leads" value={stats.byScore.HOT || 0} color="red" />
        <MetricCard icon={Phone} label="Calls Booked" value={stats.byStatus.booked || 0} color="green" />
        <MetricCard icon={FileText} label="Proposals Out" value={stats.proposalsOut || stats.byStatus.proposal_sent || 0} color="purple" />
        <MetricCard icon={UserCheck} label="Paid Clients" value={stats.totalClients || 0} color="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Lead Scores</h3>
          {scoreData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={scoreData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {scoreData.map(entry => (
                    <Cell key={entry.name} fill={SCORE_COLORS[entry.name] || '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No leads yet</div>
          )}
        </div>

        {/* Pipeline Stages */}
        <div className="bg-white rounded-xl shadow-sm border p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Pipeline Stages</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusData} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No leads yet</div>
          )}
        </div>
      </div>

      {/* Agent Health */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Agent Health</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(stats.agentHealth).map(([id, info]) => (
            <div key={id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              {info.status === 'ok' ? (
                <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
              ) : info.status === 'stale' ? (
                <AlertTriangle size={18} className="text-yellow-500 flex-shrink-0" />
              ) : (
                <XCircle size={18} className="text-gray-300 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{AGENT_LABELS[id] || id}</p>
                <p className="text-xs text-gray-500">
                  {info.lastRun
                    ? `${info.runsToday} runs today`
                    : 'Never run'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Leads */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Leads</h3>
        {stats.recentLeads.length > 0 ? (
          <div className="space-y-2">
            {stats.recentLeads.map((lead: any) => (
              <div key={lead.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-800">{lead.name}</span>
                  <span className="text-xs text-gray-500 ml-2">{lead.company || ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    lead.score === 'HOT' ? 'bg-red-100 text-red-700' :
                    lead.score === 'WARM' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{lead.score}</span>
                  <span className="text-xs text-gray-400">{lead.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No leads yet. Agents will populate this once they start running.</p>
        )}
      </div>

      {/* Full Executive Report Modal */}
      {showReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowReport(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">GovCon Sales - Full Executive Report</h2>
                <p className="text-xs text-gray-400">{new Date().toLocaleString()}</p>
              </div>
              <button onClick={() => setShowReport(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            {!reportData ? (
              <div className="p-12 text-center text-gray-400">Generating report...</div>
            ) : (
              <div className="p-6 space-y-8 text-sm">
                {/* Pipeline Overview */}
                <section>
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 border-b pb-1">Pipeline Overview</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <RptStat label="Total Leads" value={String(reportData.stats.totalLeads)} />
                    <RptStat label="HOT Leads" value={String(reportData.stats.byScore?.HOT || 0)} />
                    <RptStat label="Calls Booked" value={String(reportData.stats.byStatus?.booked || 0)} />
                    <RptStat label="Proposals Out" value={String(reportData.stats.proposalsOut || 0)} />
                    <RptStat label="Paid Clients" value={String(reportData.stats.totalClients)} />
                    <RptStat label="WARM Leads" value={String(reportData.stats.byScore?.WARM || 0)} />
                    <RptStat label="Calls Completed" value={String(reportData.stats.byStatus?.call_completed || 0)} />
                    <RptStat label="No-Shows" value={String(reportData.stats.byStatus?.no_show || 0)} />
                  </div>
                </section>

                {/* Revenue */}
                {reportData.revenue && (
                  <section>
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 border-b pb-1">Revenue</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <RptStat label="This Month" value={fmt(reportData.revenue.summary?.thisMonth?.revenue || 0)} sub={`${reportData.revenue.summary?.thisMonth?.transactions || 0} txns`} />
                      <RptStat label="Last Month" value={fmt(reportData.revenue.summary?.lastMonth?.revenue || 0)} sub={`${reportData.revenue.summary?.lastMonth?.transactions || 0} txns`} />
                      <RptStat label="YTD Revenue" value={fmt(reportData.revenue.summary?.ytd || 0)} />
                      <RptStat label="MRR" value={fmt(reportData.revenue.summary?.mrr || 0)} sub={`${reportData.revenue.summary?.activeSubscriptions || 0} subs`} />
                      <RptStat label="Avg Transaction" value={fmt(reportData.revenue.summary?.avgTransactionValue || 0)} />
                      <RptStat label="Annual Run Rate" value={fmt((reportData.revenue.summary?.mrr || 0) * 12)} />
                    </div>

                    {reportData.revenue.monthlyTrend && (
                      <div className="mt-4">
                        <h4 className="text-xs font-semibold text-gray-500 mb-2">Monthly Trend</h4>
                        <table className="w-full text-xs">
                          <thead><tr className="text-gray-500 border-b"><th className="pb-1 text-left">Month</th><th className="pb-1 text-right">Revenue</th><th className="pb-1 text-right">Txns</th><th className="pb-1 text-right">Growth</th></tr></thead>
                          <tbody>
                            {reportData.revenue.monthlyTrend.map((m: any) => {
                              const g = m.growth !== 'N/A' ? parseFloat(m.growth) : null
                              return <tr key={m.month} className="border-b"><td className="py-1">{m.month}</td><td className="py-1 text-right">{fmt(m.revenue)}</td><td className="py-1 text-right">{m.count}</td><td className={`py-1 text-right ${g === null ? '' : g >= 0 ? 'text-green-600' : 'text-red-500'}`}>{m.growth}</td></tr>
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {reportData.revenue.topCustomers && (
                      <div className="mt-4">
                        <h4 className="text-xs font-semibold text-gray-500 mb-2">Top Customers</h4>
                        <table className="w-full text-xs">
                          <thead><tr className="text-gray-500 border-b"><th className="pb-1 text-left">Customer</th><th className="pb-1 text-right">Payments</th><th className="pb-1 text-right">Total</th></tr></thead>
                          <tbody>
                            {reportData.revenue.topCustomers.slice(0, 10).map((c: any, i: number) => (
                              <tr key={i} className="border-b"><td className="py-1">{c.name}</td><td className="py-1 text-right">{c.count}</td><td className="py-1 text-right font-medium text-green-600">{fmt(c.total)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )}

                {/* Subscriptions */}
                {reportData.subs?.enabled && (
                  <section>
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 border-b pb-1">Subscriptions</h3>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <RptStat label="Active" value={String(reportData.subs.activeCount)} />
                      <RptStat label="Past Due" value={String(reportData.subs.pastDueCount)} />
                      <RptStat label="MRR" value={fmt(reportData.subs.mrr)} />
                    </div>
                    {reportData.subs.planGroups?.slice(0, 8).map((pg: any) => (
                      <div key={pg.name + pg.price} className="flex items-center justify-between py-1.5 border-b text-xs">
                        <span>{pg.name} ({fmt(pg.price)}/{pg.interval})</span>
                        <span className="font-medium">{pg.members.length} members</span>
                      </div>
                    ))}
                  </section>
                )}

                {/* Calls This Week */}
                {reportData.calls?.this_week && (
                  <section>
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 border-b pb-1">Calls This Week</h3>
                    <RptStat label="Scheduled" value={String(reportData.calls.this_week.length)} />
                  </section>
                )}

                {/* Agent Health */}
                <section>
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 border-b pb-1">Agent Health</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {Object.entries(reportData.stats.agentHealth).map(([id, info]: [string, any]) => (
                      <div key={id} className="flex items-center gap-2 text-xs p-2 rounded bg-gray-50">
                        <span className={`w-2 h-2 rounded-full ${info.status === 'ok' ? 'bg-green-500' : info.status === 'stale' ? 'bg-yellow-500' : 'bg-gray-300'}`} />
                        <span>{AGENT_LABELS[id] || id}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function RptStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-base font-bold text-gray-900">{value}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  )
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function MetricCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  }
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  )
}

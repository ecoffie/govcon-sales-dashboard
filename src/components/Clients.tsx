import { useEffect, useState } from 'react'
import { Search, DollarSign, Crown, Star, ShieldCheck } from 'lucide-react'

interface Client {
  id: string
  name: string
  email: string
  phone: string
  company: string
  score: string
  source: string
  status: string
  type: string
  client_tier: string
  client_product: string
  client_amount: string
  client_start_date: string
  client_status: string
  first_contact_date: string
  last_action: string
  last_action_date: string
  notes: string
  calendly?: { event_type: string; total_calls: number; last_call_date: string }
  company_details?: { revenue: string; industry: string }
}

const TIER_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  tier1_training: { label: 'Training', color: 'bg-blue-100 text-blue-700', icon: Star },
  tier2_consulting: { label: 'Consulting', color: 'bg-purple-100 text-purple-700', icon: Crown },
  tier3_white_glove: { label: 'White Glove BD', color: 'bg-amber-100 text-amber-700', icon: ShieldCheck },
  shop_tools: { label: 'Shop Tools', color: 'bg-green-100 text-green-700', icon: DollarSign },
  unknown: { label: 'Unknown', color: 'bg-gray-100 text-gray-600', icon: DollarSign },
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  canceled: 'bg-red-100 text-red-700',
  refunded: 'bg-orange-100 text-orange-700',
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('all')

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients).catch(() => {})
  }, [])

  const filtered = clients.filter(c => {
    if (tierFilter !== 'all' && c.client_tier !== tierFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q))
    }
    return true
  })

  const activeCount = clients.filter(c => c.client_status === 'active').length
  const canceledCount = clients.filter(c => c.client_status === 'canceled').length
  const refundedCount = clients.filter(c => c.client_status === 'refunded').length

  const tierCounts: Record<string, number> = {}
  for (const c of clients) {
    const t = c.client_tier || 'unknown'
    tierCounts[t] = (tierCounts[t] || 0) + 1
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Clients</h2>
        <span className="text-sm text-gray-500">{clients.length} total clients</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard label="Active" value={activeCount} color="emerald" />
        <SummaryCard label="Canceled" value={canceledCount} color="red" />
        <SummaryCard label="Refunded" value={refundedCount} color="orange" />
        <SummaryCard label="Training" value={tierCounts.tier1_training || 0} color="blue" />
        <SummaryCard label="Consulting+" value={(tierCounts.tier2_consulting || 0) + (tierCounts.tier3_white_glove || 0)} color="purple" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, email, or company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="all">All Tiers</option>
          <option value="tier1_training">Tier 1 — Training</option>
          <option value="tier2_consulting">Tier 2 — Consulting</option>
          <option value="tier3_white_glove">Tier 3 — White Glove</option>
          <option value="shop_tools">Shop Tools</option>
        </select>
        <span className="text-sm text-gray-500">{filtered.length} shown</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Company</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tier</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Product</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client Since</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Calls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No clients found</td></tr>
            ) : (
              filtered.map(client => {
                const tier = TIER_CONFIG[client.client_tier] || TIER_CONFIG.unknown
                const TierIcon = tier.icon
                return (
                  <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{client.name}</div>
                      <div className="text-xs text-gray-500">{client.email}</div>
                      {client.phone && <div className="text-xs text-gray-400">{client.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{client.company || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${tier.color}`}>
                        <TierIcon size={12} />
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs max-w-[200px] truncate" title={client.client_product}>
                      {client.client_product || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-800 font-medium text-xs">{client.client_amount || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[client.client_status] || 'bg-gray-100 text-gray-600'}`}>
                        {client.client_status || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {client.client_start_date
                        ? new Date(client.client_start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 text-xs">
                      {client.calendly?.total_calls || 0}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  }
  return (
    <div className={`rounded-lg border p-3 ${colors[color] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  )
}

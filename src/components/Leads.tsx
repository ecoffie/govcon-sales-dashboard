import { useEffect, useState } from 'react'
import { Search, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'

interface Lead {
  id: string
  name: string
  email: string
  phone: string
  company: string
  score: string
  source: string
  status: string
  first_contact_date: string
  last_action: string
  last_action_date: string
  follow_up_count: number
  notes: string
}

type SortKey = keyof Lead
type SortDir = 'asc' | 'desc'

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-green-100 text-green-700',
  first_touch_drafted: 'bg-green-50 text-green-600',
  meeting_interest: 'bg-amber-100 text-amber-700',
  booked: 'bg-green-100 text-green-700',
  call_completed: 'bg-green-200 text-green-800',
  proposal_sent: 'bg-purple-100 text-purple-700',
  closed_won: 'bg-emerald-100 text-emerald-800',
  closed_lost: 'bg-red-100 text-red-700',
  no_show: 'bg-orange-100 text-orange-700',
  unsubscribed: 'bg-gray-100 text-gray-500',
  paid: 'bg-emerald-200 text-emerald-900',
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [scoreFilter, setScoreFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('last_action_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [editing, setEditing] = useState<string | null>(null)

  const load = () => fetch('/api/leads-only').then(r => r.json()).then(setLeads).catch(() => {})

  useEffect(() => { load() }, [])

  const filtered = leads
    .filter(l => {
      if (scoreFilter !== 'all' && l.score !== scoreFilter) return false
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (l.name?.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q))
      }
      return true
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
  }

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    setEditing(null)
    load()
  }

  const statuses = [...new Set(leads.map(l => l.status))].sort()
  const scores = [...new Set(leads.map(l => l.score))].sort()

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Leads</h2>

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
        <select value={scoreFilter} onChange={e => setScoreFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="all">All Scores</option>
          {scores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="all">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-gray-500">{filtered.length} leads</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              {([
                ['name', 'Name'],
                ['company', 'Company'],
                ['score', 'Score'],
                ['status', 'Status'],
                ['last_action', 'Last Action'],
                ['last_action_date', 'When'],
                ['follow_up_count', 'F/U #'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                >
                  <span className="flex items-center gap-1">{label} <SortIcon col={key} /></span>
                </th>
              ))}
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No leads found</td></tr>
            ) : (
              filtered.map(lead => (
                <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{lead.name}</div>
                    <div className="text-xs text-gray-500">{lead.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{lead.company || '—'}</td>
                  <td className="px-4 py-3">
                    {editing === lead.id ? (
                      <select
                        defaultValue={lead.score}
                        onChange={e => updateLead(lead.id, { score: e.target.value })}
                        className="border rounded px-2 py-1 text-xs"
                        autoFocus
                      >
                        <option value="HOT">HOT</option>
                        <option value="WARM">WARM</option>
                        <option value="BASIC">BASIC</option>
                      </select>
                    ) : (
                      <span
                        onClick={() => setEditing(lead.id)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full cursor-pointer ${
                          lead.score === 'HOT' ? 'bg-red-100 text-red-700' :
                          lead.score === 'WARM' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}
                      >{lead.score}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-600'}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{lead.last_action || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {lead.last_action_date ? new Date(lead.last_action_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{lead.follow_up_count ?? 0}</td>
                  <td className="px-4 py-3">
                    {lead.notes && (
                      <span title={lead.notes} className="text-gray-400 cursor-help">
                        <ExternalLink size={14} />
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

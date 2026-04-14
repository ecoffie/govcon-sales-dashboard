import { useEffect, useState } from 'react'
import { RefreshCw, Inbox, UserPlus, Mail, Phone, FileText, AlertTriangle, CheckCircle } from 'lucide-react'

interface AgentEvent {
  ts: string
  from: string
  to: string
  type: string
  lead_id?: string
  payload?: any
}

const AGENT_COLORS: Record<string, string> = {
  'gc-lead-intake': 'bg-blue-100 text-blue-700',
  'gc-email-responder': 'bg-purple-100 text-purple-700',
  'gc-appointment-setter': 'bg-green-100 text-green-700',
  'gc-post-call': 'bg-amber-100 text-amber-700',
  'gc-crm-morning': 'bg-cyan-100 text-cyan-700',
  'gc-crm-evening': 'bg-indigo-100 text-indigo-700',
  'gc-qa-health': 'bg-rose-100 text-rose-700',
}

const EVENT_ICONS: Record<string, any> = {
  new_lead: UserPlus,
  run_summary: CheckCircle,
  hot_lead: AlertTriangle,
  wants_meeting: Phone,
  booking_confirmed: Phone,
  call_completed: Phone,
  no_show: AlertTriangle,
  schedule_follow_up: Mail,
}

function eventDescription(event: AgentEvent): string {
  const p = event.payload || {}
  switch (event.type) {
    case 'new_lead':
      return `New ${p.score || ''} lead: ${p.name || 'Unknown'} from ${p.company || 'Unknown'}`
    case 'run_summary':
      const parts: string[] = []
      if (p.new_leads !== undefined) parts.push(`${p.new_leads} new leads`)
      if (p.hot !== undefined) parts.push(`${p.hot} HOT`)
      if (p.drafts_created !== undefined) parts.push(`${p.drafts_created} drafts`)
      if (p.replies_processed !== undefined) parts.push(`${p.replies_processed} replies`)
      if (p.follow_ups_drafted !== undefined) parts.push(`${p.follow_ups_drafted} follow-ups`)
      if (p.bookings_confirmed !== undefined) parts.push(`${p.bookings_confirmed} bookings`)
      if (p.calls_processed !== undefined) parts.push(`${p.calls_processed} calls processed`)
      if (p.proposals_generated !== undefined) parts.push(`${p.proposals_generated} proposals`)
      if (p.briefing_generated) parts.push('briefing generated')
      if (p.reconciliation_complete) parts.push('reconciliation done')
      if (p.status) parts.push(`status: ${p.status}`)
      return parts.length > 0 ? parts.join(', ') : 'Completed run'
    case 'wants_meeting':
      return `${p.name || 'Lead'} wants to schedule a meeting`
    case 'booking_confirmed':
      return `Meeting booked for ${p.call_date ? new Date(p.call_date).toLocaleDateString() : 'TBD'}`
    case 'call_completed':
      return `Call completed — transcript ${p.transcript_id ? 'available' : 'pending'}`
    case 'no_show':
      return `No-show detected — re-engagement triggered`
    case 'schedule_follow_up':
      return `Follow-up scheduled for ${p.follow_up_date || 'soon'}`
    default:
      return event.type.replace(/_/g, ' ')
  }
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [hours, setHours] = useState(24)
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    fetch(`/api/events?hours=${hours}`)
      .then(r => r.json())
      .then(data => { setEvents(data.reverse()); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [hours])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Agent Activity</h2>
        <div className="flex items-center gap-3">
          <select value={hours} onChange={e => setHours(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            <option value={4}>Last 4 hours</option>
            <option value={12}>Last 12 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={48}>Last 48 hours</option>
            <option value={168}>Last 7 days</option>
          </select>
          <button onClick={load} className="p-2 rounded-lg border hover:bg-gray-50 transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin text-brand-500' : 'text-gray-500'} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border">
        {events.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No agent activity in the last {hours} hours</p>
            <p className="text-xs text-gray-400 mt-1">Events will appear here once agents start running</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {events.map((event, i) => {
              const Icon = EVENT_ICONS[event.type] || CheckCircle
              const agentColor = AGENT_COLORS[event.from] || 'bg-gray-100 text-gray-600'
              return (
                <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className={`p-1.5 rounded-lg mt-0.5 ${agentColor}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${agentColor}`}>
                        {event.from.replace('gc-', '')}
                      </span>
                      {event.lead_id && (
                        <span className="text-xs text-gray-400">{event.lead_id}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 mt-1">{eventDescription(event)}</p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                    {new Date(event.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

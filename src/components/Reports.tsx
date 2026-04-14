import { useEffect, useState } from 'react'
import { FileText, Calendar, Sun, Moon, Shield } from 'lucide-react'

interface ReportList {
  daily: string[]
  weekly: string[]
}

export default function Reports() {
  const [reports, setReports] = useState<ReportList>({ daily: [], weekly: [] })
  const [activeReport, setActiveReport] = useState<{ content: string; filename: string } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/reports').then(r => r.json()).then(setReports).catch(() => {})
  }, [])

  const loadReport = async (filename: string, subdir: string) => {
    setLoading(true)
    // Extract date and type from filename like "2026-04-10-morning.md"
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/)
    if (match) {
      const [, date, type] = match
      try {
        const r = await fetch(`/api/reports/${type}?date=${date}`)
        if (r.ok) {
          const data = await r.json()
          setActiveReport({ content: data.content, filename })
        }
      } catch {}
    }
    setLoading(false)
  }

  const reportIcon = (filename: string) => {
    if (filename.includes('morning')) return <Sun size={14} className="text-amber-500" />
    if (filename.includes('evening')) return <Moon size={14} className="text-green-500" />
    if (filename.includes('qa')) return <Shield size={14} className="text-rose-500" />
    return <FileText size={14} className="text-gray-400" />
  }

  const reportLabel = (filename: string) => {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/)
    if (!match) return filename
    const [, date, type] = match
    const d = new Date(date + 'T12:00:00')
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const typeStr = type === 'morning' ? 'Morning Briefing' : type === 'evening' ? 'Evening Recon' : type === 'qa' ? 'QA Report' : type
    return `${dateStr} — ${typeStr}`
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Reports</h2>

      <div className="flex gap-6">
        {/* Report List */}
        <div className="w-72 flex-shrink-0 space-y-4">
          {/* Daily */}
          <div className="bg-white rounded-xl shadow-sm border">
            <h3 className="px-4 py-3 text-sm font-semibold text-gray-700 border-b flex items-center gap-2">
              <Calendar size={14} /> Daily Reports
            </h3>
            {reports.daily.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">No reports yet</p>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                {reports.daily.map(f => (
                  <button
                    key={f}
                    onClick={() => loadReport(f, 'daily')}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                      activeReport?.filename === f ? 'bg-brand-50' : ''
                    }`}
                  >
                    {reportIcon(f)}
                    <span className="text-sm text-gray-700">{reportLabel(f)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Weekly */}
          <div className="bg-white rounded-xl shadow-sm border">
            <h3 className="px-4 py-3 text-sm font-semibold text-gray-700 border-b flex items-center gap-2">
              <Calendar size={14} /> Weekly Reports
            </h3>
            {reports.weekly.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">No reports yet</p>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
                {reports.weekly.map(f => (
                  <button
                    key={f}
                    onClick={() => loadReport(f, 'weekly')}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                      activeReport?.filename === f ? 'bg-brand-50' : ''
                    }`}
                  >
                    <FileText size={14} className="text-green-500" />
                    <span className="text-sm text-gray-700">{f.replace('.md', '')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Report Content */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading report...</div>
          ) : activeReport ? (
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">{reportLabel(activeReport.filename)}</h3>
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed bg-gray-50 rounded-lg p-4">
                  {activeReport.content}
                </pre>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center">
              <FileText size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Select a report to view</p>
              <p className="text-xs text-gray-400 mt-1">Morning briefings, evening reconciliations, and QA reports appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

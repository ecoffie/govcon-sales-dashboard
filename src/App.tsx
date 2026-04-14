import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, UserCheck, Phone, Activity, FileText, DollarSign } from 'lucide-react'
import Dashboard from './components/Dashboard'
import Leads from './components/Leads'
import Clients from './components/Clients'
import TodayCalls from './components/TodayCalls'
import ActivityFeed from './components/ActivityFeed'
import Reports from './components/Reports'
import Revenue from './components/Revenue'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/calls', icon: Phone, label: 'Calls' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/clients', icon: UserCheck, label: 'Clients' },
  { to: '/revenue', icon: DollarSign, label: 'Revenue' },
  { to: '/activity', icon: Activity, label: 'Activity' },
  { to: '/reports', icon: FileText, label: 'Reports' },
]

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-64 bg-brand-950 text-white flex flex-col">
          <div className="p-6 border-b border-brand-800">
            <h1 className="text-lg font-bold">GovCon Sales</h1>
            <p className="text-brand-300 text-xs mt-1">AI Team Dashboard</p>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-green-600/20 text-green-400 border-l-2 border-green-500'
                      : 'text-brand-300 hover:bg-brand-800 hover:text-white'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="p-4 border-t border-brand-800 text-xs text-brand-400">
            7 Agents Active
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/calls" element={<TodayCalls />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/revenue" element={<Revenue />} />
            <Route path="/activity" element={<ActivityFeed />} />
            <Route path="/reports" element={<Reports />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

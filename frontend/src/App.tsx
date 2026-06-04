import { useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { MessageSquare, BarChart2, FlaskConical, Zap } from 'lucide-react'
import AgentChat from './components/chat/AgentChat'
import PipelineDashboard from './components/dashboard/PipelineDashboard'
import EvalsPanel from './components/evals/EvalsPanel'

export default function App() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">Agentforce</div>
              <div className="text-xs text-gray-400">Field Intelligence</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            <MessageSquare className="w-4 h-4" />
            Agent Chat
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            <BarChart2 className="w-4 h-4" />
            Pipeline
          </NavLink>
          <NavLink
            to="/evals"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            <FlaskConical className="w-4 h-4" />
            Prompt Evals
          </NavLink>
        </nav>
        <div className="p-3 border-t border-gray-100">
          <div className="text-xs text-gray-400 px-2">Built on Claude + GraphQL</div>
          <div className="text-xs text-gray-300 px-2 mt-1">By Surya Prabhav Gurram</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<AgentChat />} />
          <Route path="/dashboard" element={<div className="flex-1 overflow-y-auto"><PipelineDashboard /></div>} />
          <Route path="/evals" element={<div className="flex-1 overflow-y-auto"><EvalsPanel /></div>} />
        </Routes>
      </main>
    </div>
  )
}

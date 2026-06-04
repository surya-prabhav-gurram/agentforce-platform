import React from 'react'
import { useQuery } from '@apollo/client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { TrendingUp, AlertTriangle, DollarSign, Target, Loader2 } from 'lucide-react'
import { GET_PIPELINE_SUMMARY, GET_CRM_RECORDS } from '../../lib/graphql'

const STAGE_COLORS: Record<string, string> = {
  Discovery: '#94a3b8',
  Proposal: '#60a5fa',
  Negotiation: '#f59e0b',
  'Closed Won': '#22c55e',
  'Closed Lost': '#ef4444',
}

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

export default function PipelineDashboard() {
  const { data: pipelineData, loading: pipelineLoading } = useQuery(GET_PIPELINE_SUMMARY, {
    pollInterval: 10000,
  })
  const { data: oppsData, loading: oppsLoading } = useQuery(GET_CRM_RECORDS, {
    variables: { type: 'OPPORTUNITY' },
  })
  const { data: accountsData } = useQuery(GET_CRM_RECORDS, {
    variables: { type: 'ACCOUNT' },
  })

  const pipeline = pipelineData?.pipelineSummary
  const opportunities = oppsData?.crmRecords ?? []
  const accounts = accountsData?.crmRecords ?? []

  if (pipelineLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pipeline Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Real-time CRM intelligence</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
            <DollarSign className="w-4 h-4" /> Total Pipeline
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(pipeline?.totalValue ?? 0)}</div>
          <div className="text-xs text-gray-400 mt-1">{pipeline?.totalOpportunities} opportunities</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
            <Target className="w-4 h-4" /> Weighted Forecast
          </div>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(pipeline?.weightedValue ?? 0)}</div>
          <div className="text-xs text-gray-400 mt-1">Probability-adjusted</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
            <TrendingUp className="w-4 h-4" /> Accounts
          </div>
          <div className="text-2xl font-bold text-gray-900">{accounts.length}</div>
          <div className="text-xs text-gray-400 mt-1">Active accounts</div>
        </div>

        <div className="bg-white rounded-2xl border border-red-100 p-4 bg-red-50">
          <div className="flex items-center gap-2 text-red-500 text-xs mb-2">
            <AlertTriangle className="w-4 h-4" /> At Risk
          </div>
          <div className="text-2xl font-bold text-red-600">{pipeline?.atRiskCount ?? 0}</div>
          <div className="text-xs text-red-400 mt-1">Deals need attention</div>
        </div>
      </div>

      {/* Pipeline by Stage chart */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Pipeline by Stage</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={pipeline?.byStage ?? []} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="stage" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {(pipeline?.byStage ?? []).map((entry: { stage: string }) => (
                <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] ?? '#94a3b8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Opportunities table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Open Opportunities</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {opportunities.map((opp: { id: string; name: string; data: Record<string, unknown> }) => {
            const d = opp.data
            const prob = d.probability as number
            return (
              <div key={opp.id} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{opp.name}</div>
                  <div className="text-xs text-gray-400">{d.owner as string} · closes {d.closeDate as string}</div>
                </div>
                <div className="text-sm font-semibold text-gray-700">{formatCurrency(d.amount as number)}</div>
                <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  d.stage === 'Closed Won' ? 'bg-green-100 text-green-700' :
                  d.stage === 'Negotiation' ? 'bg-amber-100 text-amber-700' :
                  d.stage === 'Proposal' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{d.stage as string}</div>
                <div className="w-16 text-right text-xs text-gray-500">{prob}%</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Accounts health */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Account Health</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {accounts.map((acc: { id: string; name: string; data: Record<string, unknown> }) => {
            const d = acc.data
            const score = d.healthScore as number
            return (
              <div key={acc.id} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{acc.name}</div>
                  <div className="text-xs text-gray-400">{d.industry as React.ReactNode} · {d.owner as React.ReactNode}</div>
                </div>
                {!!d.arr && <div className="text-xs text-gray-500">{formatCurrency(d.arr as number)} ARR</div>}
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-600">{score}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

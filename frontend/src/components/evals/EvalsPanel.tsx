import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { FlaskConical, Play, CheckCircle, Clock, ChevronDown, ChevronRight, Loader2, Plus, Check } from 'lucide-react'
import {
  GET_AGENTS, GET_PROMPT_VERSIONS, CREATE_PROMPT_VERSION,
  ACTIVATE_PROMPT_VERSION, RUN_EVALS, GET_EVAL_CASES
} from '../../lib/graphql'

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-400">Not run</span>
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? 'text-green-600 bg-green-50' : pct >= 60 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{pct}%</span>
}

export default function EvalsPanel() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null)
  const [newPrompt, setNewPrompt] = useState('')
  const [showNewPrompt, setShowNewPrompt] = useState(false)
  const [runningEval, setRunningEval] = useState<string | null>(null)

  const { data: agentsData } = useQuery(GET_AGENTS)
  const { data: versionsData, refetch: refetchVersions } = useQuery(GET_PROMPT_VERSIONS, {
    variables: { agentId: selectedAgentId ?? '' },
    skip: !selectedAgentId,
  })
  const { data: evalCasesData } = useQuery(GET_EVAL_CASES)

  const [createPromptVersion] = useMutation(CREATE_PROMPT_VERSION)
  const [activatePromptVersion] = useMutation(ACTIVATE_PROMPT_VERSION)
  const [runEvals] = useMutation(RUN_EVALS)

  const agents = agentsData?.agents ?? []
  const versions = versionsData?.promptVersions ?? []
  const evalCases = evalCasesData?.evalCases ?? []

  const selectedAgent = agents.find((a: { id: string }) => a.id === selectedAgentId)

  const handleCreateVersion = async () => {
    if (!selectedAgentId || !newPrompt.trim()) return
    await createPromptVersion({ variables: { agentId: selectedAgentId, systemPrompt: newPrompt.trim() } })
    setNewPrompt('')
    setShowNewPrompt(false)
    refetchVersions()
  }

  const handleActivate = async (pvId: string) => {
    await activatePromptVersion({ variables: { promptVersionId: pvId } })
    refetchVersions()
  }

  const handleRunEvals = async (pvId: string) => {
    if (!selectedAgentId) return
    setRunningEval(pvId)
    try {
      await runEvals({ variables: { agentId: selectedAgentId, promptVersionId: pvId } })
      refetchVersions()
    } finally {
      setRunningEval(null)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Prompt Evals</h1>
        <p className="text-gray-500 text-sm mt-1">Version and evaluate agent prompts with LLM-as-judge scoring</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Agent selector */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Select Agent</h2>
          <div className="space-y-1">
            {agents.map((agent: { id: string; name: string; type: string }) => (
              <button
                key={agent.id}
                onClick={() => { setSelectedAgentId(agent.id); setShowNewPrompt(false) }}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                  selectedAgentId === agent.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {agent.name}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt versions */}
        <div className="col-span-2 space-y-4">
          {!selectedAgentId && (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-400">
              <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Select an agent to view prompt versions</p>
            </div>
          )}

          {selectedAgentId && (
            <>
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">
                    {selectedAgent?.name} — Prompt Versions
                  </h2>
                  <button
                    onClick={() => setShowNewPrompt(!showNewPrompt)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Plus className="w-3.5 h-3.5" /> New Version
                  </button>
                </div>

                {showNewPrompt && (
                  <div className="mb-4 space-y-2">
                    <textarea
                      value={newPrompt}
                      onChange={e => setNewPrompt(e.target.value)}
                      placeholder="Enter new system prompt..."
                      rows={6}
                      className="w-full border border-gray-200 rounded-xl p-3 text-sm font-mono resize-none focus:outline-none focus:border-blue-400"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleCreateVersion} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                        Save Version
                      </button>
                      <button onClick={() => setShowNewPrompt(false)} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {versions.map((pv: {
                    id: string; version: number; isActive: boolean; avgScore: number | null;
                    systemPrompt: string; createdAt: string;
                    evalResults: Array<{ id: string; score: number; reasoning: string; actualOutput: string; evalCase: { query: string; category: string } }>
                  }) => (
                    <div key={pv.id} className={`rounded-xl border ${pv.isActive ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-center gap-3 p-3">
                        <button
                          onClick={() => setExpandedVersion(expandedVersion === pv.id ? null : pv.id)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {expandedVersion === pv.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-800">v{pv.version}</span>
                            {pv.isActive && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-600 text-white rounded-full">Active</span>
                            )}
                            <ScoreBadge score={pv.avgScore} />
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{pv.systemPrompt.slice(0, 80)}...</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!pv.isActive && (
                            <button
                              onClick={() => handleActivate(pv.id)}
                              className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                            >
                              <Check className="w-3 h-3" /> Activate
                            </button>
                          )}
                          <button
                            onClick={() => handleRunEvals(pv.id)}
                            disabled={runningEval === pv.id}
                            className="flex items-center gap-1 text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50"
                          >
                            {runningEval === pv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                            Run Evals
                          </button>
                        </div>
                      </div>

                      {expandedVersion === pv.id && (
                        <div className="px-4 pb-4 border-t border-gray-100 mt-1 pt-3">
                          <h4 className="text-xs font-semibold text-gray-500 mb-2">System Prompt</h4>
                          <pre className="text-xs bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-mono text-gray-700 mb-4 max-h-40 overflow-y-auto">
                            {pv.systemPrompt}
                          </pre>

                          {pv.evalResults.length > 0 && (
                            <>
                              <h4 className="text-xs font-semibold text-gray-500 mb-2">Eval Results ({pv.evalResults.length} cases)</h4>
                              <div className="space-y-2">
                                {pv.evalResults.map(result => (
                                  <div key={result.id} className="bg-white rounded-lg border border-gray-100 p-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="text-xs font-medium text-gray-700 flex-1">{result.evalCase.query}</div>
                                      <ScoreBadge score={result.score} />
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">{result.reasoning}</div>
                                    <div className="text-xs text-gray-400 mt-1 italic truncate">{result.actualOutput.slice(0, 120)}...</div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Eval cases */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Eval Test Cases ({evalCases.length})</h2>
                <div className="space-y-2">
                  {evalCases.map((ec: { id: string; query: string; category: string; expectedOutput: string }) => (
                    <div key={ec.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium mt-0.5 ${
                        ec.category === 'pipeline' ? 'bg-blue-100 text-blue-700' :
                        ec.category === 'retention' ? 'bg-red-100 text-red-700' :
                        ec.category === 'forecast' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{ec.category}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-700">{ec.query}</div>
                        {ec.expectedOutput && <div className="text-xs text-gray-400 mt-0.5 truncate">{ec.expectedOutput}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

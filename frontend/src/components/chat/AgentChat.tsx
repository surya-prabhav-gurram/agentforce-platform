import { useState, useEffect, useRef } from 'react'

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-semibold mt-2 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^---$/gm, '<hr class="my-2 border-gray-200"/>')
    .replace(/^\|[-| :]+\|$/gm, '§SEPARATOR§')
    .replace(/^\| (.+) \|$/gm, (_line, inner) => {
      const cells = inner.split(' | ')
      return '<tr>' + cells.map((c: string) => `<td class="border border-gray-200 px-2 py-1 text-xs">${c.trim()}</td>`).join('') + '</tr>'
    })
    .replace(/<tr>(.*?)<\/tr>\n?§SEPARATOR§\n?/gs, (_m, cells) =>
      '<tr>' + cells.replace(/<td /g, '<th class="border border-gray-200 px-2 py-1 text-xs font-semibold bg-gray-50 ') + '</tr>'
    )
    .replace(/§SEPARATOR§\n?/g, '')
    .replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, (table) => `<table class="border-collapse border border-gray-200 my-2 w-full">${table}</table>`)
    .replace(/^(\d+)\. (.+)$/gm, '<li style="list-style-type:decimal" class="ml-4">$2</li>')
    .replace(/(<li style="list-style-type:decimal"[\s\S]*?<\/li>\n?)+/g, (list) => `<ol class="my-1 ml-4">${list}</ol>`)
    .replace(/^- \[ \] (.+)$/gm, '<li class="ml-4 flex items-start gap-2"><input type="checkbox" disabled class="mt-1 flex-shrink-0"/> <span>$1</span></li>')
    .replace(/^- \[x\] (.+)$/gm, '<li class="ml-4 flex items-start gap-2"><input type="checkbox" checked disabled class="mt-1 flex-shrink-0"/> <span>$1</span></li>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/(<li[\s\S]*?<\/li>\n?)+/g, (list) => `<ul class="my-1">${list}</ul>`)
    .replace(/(<\/h[1234]>|<\/table>|<\/ul>|<\/ol>|<hr[^>]*\/>)\n+/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\n/g, '<br/>')
    .replace(/\n/g, ' ')
}
import { useMutation, useSubscription } from '@apollo/client'
import { Send, Bot, User, Zap, Search, GitMerge, AlertTriangle, CheckCircle, XCircle, Loader2, Plus } from 'lucide-react'
import {
  START_SESSION, SEND_MESSAGE, AGENT_EVENT_SUBSCRIPTION,
  APPROVAL_SUBSCRIPTION, RESOLVE_APPROVAL
} from '../../lib/graphql'

type AgentType = 'ROUTER' | 'CRM' | 'RESEARCH' | 'SYNTHESIS'
type EventType = 'ROUTING' | 'AGENT_START' | 'TOKEN' | 'TOOL_CALL' | 'TOOL_RESULT' |
  'APPROVAL_REQUIRED' | 'AGENT_COMPLETE' | 'SESSION_COMPLETE' | 'ERROR'

interface AgentEvent {
  sessionId: string
  type: EventType
  agentType?: AgentType
  content?: string
  isComplete: boolean
  error?: string
  toolCall?: { toolName: string; toolInput: Record<string, unknown> }
  toolResult?: { toolName: string; result: unknown }
  approval?: { id: string; sessionId: string; toolName: string; toolInput: unknown; status: string }
}

interface TraceItem {
  id: string
  type: EventType
  agentType?: AgentType
  content: string
  toolCall?: { toolName: string; toolInput: unknown }
  toolResult?: unknown
}

interface ApprovalRequest {
  id: string
  toolName: string
  toolInput: unknown
  status: string
}

const AGENT_COLORS: Record<AgentType, string> = {
  ROUTER: 'text-purple-600 bg-purple-50 border-purple-200',
  CRM: 'text-blue-600 bg-blue-50 border-blue-200',
  RESEARCH: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  SYNTHESIS: 'text-amber-600 bg-amber-50 border-amber-200',
}

const AGENT_ICONS: Record<AgentType, typeof Bot> = {
  ROUTER: GitMerge,
  CRM: Bot,
  RESEARCH: Search,
  SYNTHESIS: Zap,
}

const SUGGESTED_QUERIES = [
  'Show me all open opportunities over $100k',
  'Which accounts are at risk of churning?',
  'Research GlobalRetail Inc for our upcoming pitch',
  'Give me a full account brief on MedTech Solutions',
  "What's the pipeline summary for Marcus Webb?",
]

export default function AgentChat() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [trace, setTrace] = useState<TraceItem[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [activeAgent, setActiveAgent] = useState<AgentType | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([])
  const [resolvingApprovals, setResolvingApprovals] = useState<Set<string>>(new Set())
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const streamingContentRef = useRef('')
  const sessionIdRef = useRef<string | null>(null)

  const [startSession] = useMutation(START_SESSION)
  const [sendMessage] = useMutation(SEND_MESSAGE)
  const [resolveApproval] = useMutation(RESOLVE_APPROVAL)

  const initSession = () => {
    startSession().then(({ data }) => {
      if (data?.startSession?.id) {
        setSessionId(data.startSession.id)
        sessionIdRef.current = data.startSession.id
      }
    })
  }

  const resetChat = () => {
    setMessages([])
    setTrace([])
    setStreamingContent('')
    streamingContentRef.current = ''
    setPendingApprovals([])
    setResolvingApprovals(new Set())
    setIsProcessing(false)
    setActiveAgent(null)
    setInput('')
    initSession()
  }

  useEffect(() => { initSession() }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [trace, streamingContent, messages, pendingApprovals])

  useSubscription(AGENT_EVENT_SUBSCRIPTION, {
    variables: { sessionId: sessionId ?? '' },
    skip: !sessionId,
    onData: ({ data }) => {
      const event: AgentEvent = data.data?.agentEvent
      if (!event) return
      if (event.sessionId !== sessionIdRef.current) return

      if (event.type === 'ROUTING' || event.type === 'AGENT_START') {
        if (event.agentType) setActiveAgent(event.agentType)
        setTrace(prev => [...prev, {
          id: Math.random().toString(36).slice(2),
          type: event.type,
          agentType: event.agentType,
          content: event.content ?? '',
        }])
      }

      if (event.type === 'TOKEN' && event.content) {
        setStreamingContent(prev => {
          const next = prev + event.content
          streamingContentRef.current = next
          return next
        })
      }

      if (event.type === 'TOOL_CALL') {
        setTrace(prev => [...prev, {
          id: Math.random().toString(36).slice(2),
          type: 'TOOL_CALL',
          agentType: event.agentType,
          content: `Calling ${event.toolCall?.toolName}`,
          toolCall: event.toolCall,
        }])
      }

      if (event.type === 'TOOL_RESULT') {
        setTrace(prev => [...prev, {
          id: Math.random().toString(36).slice(2),
          type: 'TOOL_RESULT',
          agentType: event.agentType,
          content: `${event.toolResult?.toolName} returned`,
          toolResult: event.toolResult?.result,
        }])
      }

      if (event.type === 'APPROVAL_REQUIRED' && event.approval) {
        setPendingApprovals(prev => [...prev, event.approval as ApprovalRequest])
      }

      if (event.type === 'SESSION_COMPLETE') {
        const finalText = streamingContentRef.current || event.content || ''
        streamingContentRef.current = ''
        setMessages(prev => [...prev, { role: 'assistant', content: finalText }])
        setStreamingContent('')
        setActiveAgent(null)
        setIsProcessing(false)
        setTrace([])
      }

      if (event.type === 'ERROR') {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${event.error}` }])
        setIsProcessing(false)
        setTrace([])
        setStreamingContent('')
        streamingContentRef.current = ''
        setActiveAgent(null)
      }
    },
  })

  const handleSend = async (content = input) => {
    if (!content.trim() || !sessionId || isProcessing) return
    const trimmed = content.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    setIsProcessing(true)
    setTrace([])
    setStreamingContent('')
    streamingContentRef.current = ''

    try {
      await sendMessage({ variables: { sessionId, content: trimmed } })
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to send message.' }])
      setIsProcessing(false)
    }
  }

  const handleApproval = async (approvalId: string, approved: boolean) => {
    setResolvingApprovals(prev => new Set(prev).add(approvalId))
    try {
      await resolveApproval({ variables: { approvalId, approved } })
      setPendingApprovals(prev => prev.filter(a => a.id !== approvalId))
    } finally {
      setResolvingApprovals(prev => { const s = new Set(prev); s.delete(approvalId); return s })
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mb-4">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Agentforce Field Intelligence</h2>
              <p className="text-gray-500 mb-8 max-w-md">
                A multi-agent system for enterprise sales intelligence. Ask about accounts, opportunities, research, or get strategic briefings.
              </p>
              <div className="grid grid-cols-1 gap-2 w-full max-w-lg">
                {SUGGESTED_QUERIES.map(q => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="text-left px-4 py-2.5 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-sm text-gray-700 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 mt-1">
                  <Zap className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm whitespace-pre-wrap'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
              }`}>
                {msg.role === 'assistant'
                  ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  : msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="w-4 h-4 text-gray-600" />
                </div>
              )}
            </div>
          ))}

          {streamingContent && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 mt-1">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div className="max-w-[75%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-white border border-gray-200 text-gray-800 leading-relaxed whitespace-pre-wrap">
                {streamingContent}
                <span className="inline-block w-1.5 h-4 bg-blue-400 ml-0.5 animate-pulse" />
              </div>
            </div>
          )}

          {pendingApprovals.map(approval => (
            <div key={approval.id} className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">Approval Required</span>
                </div>
                <p className="text-sm text-amber-700 mb-1">
                  The CRM Agent wants to run: <code className="font-mono bg-amber-100 px-1 rounded">{approval.toolName}</code>
                </p>
                <pre className="text-xs bg-amber-100 rounded-lg p-2 mb-3 overflow-x-auto text-amber-800">
                  {JSON.stringify(approval.toolInput, null, 2)}
                </pre>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproval(approval.id, true)}
                    disabled={resolvingApprovals.has(approval.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resolvingApprovals.has(approval.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Approve
                  </button>
                  <button
                    onClick={() => handleApproval(approval.id, false)}
                    disabled={resolvingApprovals.has(approval.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resolvingApprovals.has(approval.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Reject
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        <div className="border-t border-gray-200 p-4 bg-white">
          <div className="flex gap-3 items-end">
            <button
              onClick={resetChat}
              disabled={isProcessing}
              title="New Chat"
              className="p-3 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0 disabled:opacity-40"
            >
              <Plus className="w-5 h-5" />
            </button>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Ask about accounts, opportunities, or request a strategic brief..."
              rows={1}
              disabled={isProcessing}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-blue-400 disabled:opacity-50 bg-gray-50"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isProcessing}
              className="p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {(isProcessing || trace.length > 0) && (
        <div className="w-72 border-l border-gray-200 bg-gray-50 flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-3 border-b border-gray-200 bg-white">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Agent Trace</h3>
            {activeAgent && (
              <div className={`mt-1.5 inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${AGENT_COLORS[activeAgent]}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {activeAgent} Agent active
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {trace.map(item => {
              const Icon = item.agentType ? AGENT_ICONS[item.agentType] : Bot
              return (
                <div key={item.id} className={`rounded-lg p-2.5 border text-xs ${item.agentType ? AGENT_COLORS[item.agentType] : 'bg-white border-gray-200 text-gray-700'}`}>
                  <div className="flex items-center gap-1.5 font-medium mb-0.5">
                    <Icon className="w-3 h-3" />
                    {item.type.replace(/_/g, ' ')}
                  </div>
                  <div className="opacity-80 line-clamp-3">{item.content}</div>
                  {item.toolCall && (
                    <div className="mt-1.5 bg-black/5 rounded p-1.5 font-mono text-[10px] overflow-x-auto">
                      {JSON.stringify(item.toolCall.toolInput, null, 1).slice(0, 120)}...
                    </div>
                  )}
                </div>
              )
            })}
            {isProcessing && trace.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Initializing agents...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

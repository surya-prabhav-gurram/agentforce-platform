import Anthropic from '@anthropic-ai/sdk'
import { pubsub, AGENT_EVENT, APPROVAL_REQUIRED } from '../graphql/pubsub.js'
import { prisma } from '../db/client.js'
import { crmTools, executeCrmTool, requiresApproval } from '../tools/crmTools.js'
import { researchTools, executeResearchTool } from '../tools/researchTools.js'
import { storeMessageWithEmbedding, buildContextWindow } from '../memory/vectorMemory.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type AgentEventType =
  | 'ROUTING' | 'AGENT_START' | 'TOKEN' | 'TOOL_CALL'
  | 'TOOL_RESULT' | 'APPROVAL_REQUIRED' | 'AGENT_COMPLETE'
  | 'SESSION_COMPLETE' | 'ERROR'

function emit(sessionId: string, type: AgentEventType, payload: Record<string, unknown> = {}) {
  pubsub.publish(AGENT_EVENT, {
    agentEvent: {
      sessionId,
      type,
      isComplete: type === 'SESSION_COMPLETE' || type === 'ERROR',
      ...payload,
    },
  })
}

// ─── ROUTER AGENT ────────────────────────────────────────────────────────────

async function routerAgent(sessionId: string, query: string): Promise<{
  targetAgent: 'CRM' | 'RESEARCH' | 'SYNTHESIS'
  enrichedQuery: string
  reasoning: string
}> {
  emit(sessionId, 'ROUTING', { agentType: 'ROUTER', content: 'Analyzing query...' })

  const routerPrompt = await getActivePrompt('router-agent-001')

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 300,
    system: routerPrompt,
    messages: [{ role: 'user', content: query }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      emit(sessionId, 'ROUTING', {
        agentType: 'ROUTER',
        content: `Routing to ${parsed.targetAgent}: ${parsed.reasoning}`,
      })
      return parsed
    }
  } catch {}

  // Fallback routing
  const lower = query.toLowerCase()
  if (lower.includes('account') || lower.includes('opportunity') || lower.includes('deal') || lower.includes('pipeline')) {
    return { targetAgent: 'CRM', enrichedQuery: query, reasoning: 'Query contains CRM-related keywords' }
  }
  if (lower.includes('research') || lower.includes('market') || lower.includes('competitor') || lower.includes('news')) {
    return { targetAgent: 'RESEARCH', enrichedQuery: query, reasoning: 'Query requires external research' }
  }
  return { targetAgent: 'SYNTHESIS', enrichedQuery: query, reasoning: 'Complex query requiring synthesis' }
}

// ─── CRM AGENT ───────────────────────────────────────────────────────────────

async function crmAgent(sessionId: string, query: string): Promise<string> {
  emit(sessionId, 'AGENT_START', { agentType: 'CRM', content: 'CRM Agent activated — querying sales data...' })

  const systemPrompt = await getActivePrompt('crm-agent-001')
  const contextMessages = await buildContextWindow(sessionId, query)

  const messages: Anthropic.MessageParam[] = [
    ...contextMessages,
    { role: 'user', content: query },
  ]

  let finalResponse = ''

  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      tools: crmTools,
      messages,
    })

    // Stream text tokens
    for (const block of response.content) {
      if (block.type === 'text') {
        const words = block.text.split(' ')
        for (const word of words) {
          emit(sessionId, 'TOKEN', { agentType: 'CRM', content: word + ' ' })
          await new Promise(r => setTimeout(r, 30))
        }
        finalResponse += block.text
      }
    }

    // If no tool calls, we're done
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') break

    // Add assistant message with ALL content blocks
    messages.push({ role: 'assistant', content: response.content })

    // Process ALL tool calls and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const block of toolUseBlocks) {
      emit(sessionId, 'TOOL_CALL', {
        agentType: 'CRM',
        toolCall: { toolName: block.name, toolInput: block.input },
      })

      let result: unknown

      if (requiresApproval(block.name, block.input as Record<string, unknown>)) {
        const approval = await prisma.approvalRequest.create({
          data: {
            sessionId,
            toolName: block.name,
            toolInput: block.input as any,
            status: 'PENDING',
          },
        })

        emit(sessionId, 'APPROVAL_REQUIRED', { approval: { ...approval, toolInput: approval.toolInput } })
        pubsub.publish(APPROVAL_REQUIRED, { approvalRequired: { ...approval, toolInput: approval.toolInput } })

        let approved = false
        for (let i = 0; i < 300; i++) {
          await new Promise(r => setTimeout(r, 1000))
          const updated = await prisma.approvalRequest.findUnique({ where: { id: approval.id } })
          if (updated?.status === 'APPROVED') { approved = true; break }
          if (updated?.status === 'REJECTED') break
        }

        if (!approved) {
          result = { error: 'Action was not approved' }
        } else {
          result = await executeCrmTool(block.name, block.input as Record<string, unknown>)
        }
      } else {
        result = await executeCrmTool(block.name, block.input as Record<string, unknown>)
      }

      emit(sessionId, 'TOOL_RESULT', {
        agentType: 'CRM',
        toolResult: { toolName: block.name, result },
      })

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      })
    }

    // Add ALL tool results in a single user message
    messages.push({ role: 'user', content: toolResults })
  }

  emit(sessionId, 'AGENT_COMPLETE', { agentType: 'CRM', content: finalResponse })
  return finalResponse
}

// ─── RESEARCH AGENT ──────────────────────────────────────────────────────────

async function researchAgent(sessionId: string, query: string): Promise<string> {
  emit(sessionId, 'AGENT_START', { agentType: 'RESEARCH', content: 'Research Agent activated — searching for intelligence...' })

  const systemPrompt = await getActivePrompt('research-agent-001')
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: query }]

  let finalResponse = ''

  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      tools: researchTools,
      messages,
    })

    for (const block of response.content) {
      if (block.type === 'text') {
        const words = block.text.split(' ')
        for (const word of words) {
          emit(sessionId, 'TOKEN', { agentType: 'RESEARCH', content: word + ' ' })
          await new Promise(r => setTimeout(r, 25))
        }
        finalResponse += block.text
      }
    }

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') break

    messages.push({ role: 'assistant', content: response.content })

    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const block of toolUseBlocks) {
      emit(sessionId, 'TOOL_CALL', {
        agentType: 'RESEARCH',
        toolCall: { toolName: block.name, toolInput: block.input },
      })

      const result = await executeResearchTool(block.name, block.input as Record<string, unknown>)

      emit(sessionId, 'TOOL_RESULT', {
        agentType: 'RESEARCH',
        toolResult: { toolName: block.name, result },
      })

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      })
    }

    messages.push({ role: 'user', content: toolResults })
  }

  emit(sessionId, 'AGENT_COMPLETE', { agentType: 'RESEARCH', content: finalResponse })
  return finalResponse
}

// ─── SYNTHESIS AGENT ─────────────────────────────────────────────────────────

async function synthesisAgent(
  sessionId: string,
  query: string,
  crmData?: string,
  researchData?: string
): Promise<string> {
  emit(sessionId, 'AGENT_START', { agentType: 'SYNTHESIS', content: 'Synthesis Agent activated — combining intelligence...' })

  const systemPrompt = await getActivePrompt('synthesis-agent-001')

  let enrichedQuery = query
  if (crmData || researchData) {
    enrichedQuery = `${query}\n\n`
    if (crmData) enrichedQuery += `CRM DATA:\n${crmData}\n\n`
    if (researchData) enrichedQuery += `RESEARCH DATA:\n${researchData}\n\n`
    enrichedQuery += 'Please synthesize the above into a strategic recommendation.'
  }

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: enrichedQuery }],
  })

  let finalResponse = ''
  for (const block of response.content) {
    if (block.type === 'text') {
      const words = block.text.split(' ')
      for (const word of words) {
        emit(sessionId, 'TOKEN', { agentType: 'SYNTHESIS', content: word + ' ' })
        await new Promise(r => setTimeout(r, 20))
      }
      finalResponse += block.text
    }
  }

  emit(sessionId, 'AGENT_COMPLETE', { agentType: 'SYNTHESIS', content: finalResponse })
  return finalResponse
}

// ─── MAIN ORCHESTRATOR ───────────────────────────────────────────────────────

export async function orchestrate(sessionId: string, userMessage: string): Promise<void> {
  try {
    await storeMessageWithEmbedding(sessionId, 'USER', userMessage)

    const routing = await routerAgent(sessionId, userMessage)

    let finalResponse = ''

    if (routing.targetAgent === 'CRM') {
      finalResponse = await crmAgent(sessionId, routing.enrichedQuery)
    } else if (routing.targetAgent === 'RESEARCH') {
      finalResponse = await researchAgent(sessionId, routing.enrichedQuery)
    } else {
      const needsBothSources = routing.enrichedQuery.toLowerCase().includes('analyze') ||
        routing.enrichedQuery.toLowerCase().includes('recommend') ||
        routing.enrichedQuery.toLowerCase().includes('strategy') ||
        routing.enrichedQuery.toLowerCase().includes('brief') ||
        routing.enrichedQuery.toLowerCase().includes('intelligence')

      if (needsBothSources) {
        const [crmData, researchData] = await Promise.all([
          crmAgent(sessionId, routing.enrichedQuery).catch(() => ''),
          researchAgent(sessionId, routing.enrichedQuery).catch(() => ''),
        ])
        // Truncate inputs to avoid synthesis agent getting overwhelmed
        const crmSummary = crmData.slice(0, 2000)
        const researchSummary = researchData.slice(0, 2000)
        finalResponse = await synthesisAgent(sessionId, routing.enrichedQuery, crmSummary, researchSummary)
      } else {
        finalResponse = await synthesisAgent(sessionId, routing.enrichedQuery)
      }
    }

    await storeMessageWithEmbedding(sessionId, 'ASSISTANT', finalResponse, routing.targetAgent)

    emit(sessionId, 'SESSION_COMPLETE', { content: finalResponse })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    emit(sessionId, 'ERROR', { error: msg })
    console.error('Orchestrator error:', error)
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function getActivePrompt(agentId: string): Promise<string> {
  const version = await prisma.promptVersion.findFirst({
    where: { agentId, isActive: true },
  })
  if (version) return version.systemPrompt

  const agent = await prisma.agent.findUnique({ where: { id: agentId } })
  return agent?.systemPrompt ?? ''
}

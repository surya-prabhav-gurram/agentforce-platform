import { prisma } from '../../db/client.js'
import { pubsub, AGENT_EVENT, APPROVAL_REQUIRED } from '../pubsub.js'
import { orchestrate } from '../../agents/orchestrator.js'
import { runEvals } from '../../evals/evalRunner.js'

export const resolvers = {
  JSON: {
    serialize: (value: unknown) => value,
    parseValue: (value: unknown) => value,
    parseLiteral: (ast: { value: unknown }) => ast.value,
  },

  Query: {
    agents: () => prisma.agent.findMany(),
    agent: (_: unknown, { id }: { id: string }) => prisma.agent.findUnique({ where: { id } }),

    session: (_: unknown, { id }: { id: string }) =>
      prisma.agentSession.findUnique({ where: { id }, include: { agent: true, messages: { orderBy: { createdAt: 'asc' } } } }),

    sessions: () =>
      prisma.agentSession.findMany({
        include: { agent: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),

    approvalRequests: (_: unknown, { sessionId }: { sessionId: string }) =>
      prisma.approvalRequest.findMany({ where: { sessionId } }),

    promptVersions: (_: unknown, { agentId }: { agentId: string }) =>
      prisma.promptVersion.findMany({ where: { agentId }, orderBy: { version: 'desc' } }),

    evalCases: () => prisma.evalCase.findMany(),

    evalResults: (_: unknown, { promptVersionId }: { promptVersionId: string }) =>
      prisma.evalResult.findMany({
        where: { promptVersionId },
        include: { evalCase: true },
      }),

    crmRecords: (_: unknown, { type, search }: { type?: string; search?: string }) =>
      prisma.crmRecord.findMany({
        where: {
          ...(type ? { type: type as any } : {}),
          ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
        },
      }),

    pipelineSummary: async () => {
      const opps = await prisma.crmRecord.findMany({ where: { type: 'OPPORTUNITY' } })
      const data = opps.map(o => o.data as Record<string, unknown>)

      const byStage: Record<string, { count: number; value: number }> = {}
      let totalValue = 0
      let weightedValue = 0
      let atRiskCount = 0

      for (const d of data) {
        const stage = d.stage as string
        const amount = d.amount as number
        const prob = (d.probability as number) / 100
        const closeDate = new Date(d.closeDate as string)

        totalValue += amount
        weightedValue += amount * prob

        if (!byStage[stage]) byStage[stage] = { count: 0, value: 0 }
        byStage[stage].count++
        byStage[stage].value += amount

        const daysToClose = (closeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        if ((d.probability as number) < 50 || (daysToClose < 30 && (d.probability as number) < 70)) {
          atRiskCount++
        }
      }

      return {
        totalOpportunities: data.length,
        totalValue,
        weightedValue: Math.round(weightedValue),
        byStage: Object.entries(byStage).map(([stage, d]) => ({ stage, ...d })),
        atRiskCount,
      }
    },
  },

  Mutation: {
    startSession: async (_: unknown, { agentId }: { agentId?: string }) => {
      const id = agentId ?? 'router-agent-001'
      const agent = await prisma.agent.findUnique({ where: { id } })
      if (!agent) throw new Error('Agent not found')

      return prisma.agentSession.create({
        data: { agentId: id, status: 'ACTIVE' },
        include: { agent: true, messages: true },
      })
    },

    sendMessage: async (_: unknown, { sessionId, content }: { sessionId: string; content: string }) => {
      const session = await prisma.agentSession.findUnique({ where: { id: sessionId } })
      if (!session) throw new Error('Session not found')

      const message = await prisma.message.create({
        data: { sessionId, role: 'USER', content },
      })

      orchestrate(sessionId, content).catch(console.error)

      return message
    },

    resolveApproval: async (_: unknown, { approvalId, approved }: { approvalId: string; approved: boolean }) => {
      return prisma.approvalRequest.update({
        where: { id: approvalId },
        data: { status: approved ? 'APPROVED' : 'REJECTED', resolvedAt: new Date() },
      })
    },

    createPromptVersion: async (_: unknown, { agentId, systemPrompt }: { agentId: string; systemPrompt: string }) => {
      const latest = await prisma.promptVersion.findFirst({
        where: { agentId },
        orderBy: { version: 'desc' },
      })

      return prisma.promptVersion.create({
        data: { agentId, systemPrompt, version: (latest?.version ?? 0) + 1, isActive: false },
      })
    },

    activatePromptVersion: async (_: unknown, { promptVersionId }: { promptVersionId: string }) => {
      const version = await prisma.promptVersion.findUnique({ where: { id: promptVersionId } })
      if (!version) throw new Error('Prompt version not found')

      await prisma.promptVersion.updateMany({ where: { agentId: version.agentId }, data: { isActive: false } })
      return prisma.promptVersion.update({ where: { id: promptVersionId }, data: { isActive: true } })
    },

    runEvals: (_: unknown, { agentId, promptVersionId }: { agentId: string; promptVersionId: string }) =>
      runEvals(agentId, promptVersionId),

    updateCrmRecord: async (_: unknown, { id, data }: { id: string; data: Record<string, unknown> }) => {
      const existing = await prisma.crmRecord.findUnique({ where: { id } })
      if (!existing) throw new Error('Record not found')
      return prisma.crmRecord.update({
        where: { id },
        data: { data: { ...(existing.data as object), ...data } as any },
      })
    },

    endSession: (_: unknown, { sessionId }: { sessionId: string }) =>
      prisma.agentSession.update({ where: { id: sessionId }, data: { status: 'COMPLETED' } }),
  },

  Subscription: {
    agentEvent: {
      subscribe: (_: unknown, _args: { sessionId: string }) =>
        pubsub.asyncIterator([AGENT_EVENT]),
      resolve: (payload: { agentEvent: unknown }) => payload.agentEvent,
    },
    approvalRequired: {
      subscribe: (_: unknown, _args: { sessionId: string }) =>
        pubsub.asyncIterator([APPROVAL_REQUIRED]),
      resolve: (payload: { approvalRequired: unknown }) => payload.approvalRequired,
    },
  },

  Agent: {
    promptVersions: (agent: { id: string }) =>
      prisma.promptVersion.findMany({ where: { agentId: agent.id }, orderBy: { version: 'desc' } }),
  },

  PromptVersion: {
    evalResults: (pv: { id: string }) =>
      prisma.evalResult.findMany({ where: { promptVersionId: pv.id }, include: { evalCase: true } }),
    avgScore: async (pv: { id: string }) => {
      const results = await prisma.evalResult.findMany({ where: { promptVersionId: pv.id } })
      if (!results.length) return null
      return Math.round((results.reduce((s: number, r: { score: number }) => s + r.score, 0) / results.length) * 100) / 100
    },
  },

  AgentSession: {
    agent: (session: { agentId: string }) => prisma.agent.findUnique({ where: { id: session.agentId } }),
    messages: (session: { id: string }) =>
      prisma.message.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'asc' } }),
  },

  EvalResult: {
    evalCase: (result: { evalCaseId: string }) =>
      prisma.evalCase.findUnique({ where: { id: result.evalCaseId } }),
  },
}

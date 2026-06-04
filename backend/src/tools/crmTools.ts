import { prisma } from '../db/client.js'
import { Prisma } from '@prisma/client'
export const crmTools = [
  {
    name: 'query_accounts',
    description: 'Query CRM accounts with optional filters. Returns account details including health score, ARR, industry.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Search by account name' },
        stage: { type: 'string', description: 'Filter by stage: Customer, Prospect, Negotiation' },
        minHealthScore: { type: 'number', description: 'Minimum health score (0-100)' },
        maxHealthScore: { type: 'number', description: 'Maximum health score (0-100)' },
        owner: { type: 'string', description: 'Filter by account owner name' },
      },
      required: [],
    },
  },
  {
    name: 'query_opportunities',
    description: 'Query sales opportunities. Returns deals with stage, amount, close date, probability.',
    input_schema: {
      type: 'object' as const,
      properties: {
        minAmount: { type: 'number', description: 'Minimum deal amount in USD' },
        stage: { type: 'string', description: 'Filter by stage: Discovery, Proposal, Negotiation, Closed Won, Closed Lost' },
        owner: { type: 'string', description: 'Filter by rep owner name' },
        closingBefore: { type: 'string', description: 'ISO date string - find deals closing before this date' },
      },
      required: [],
    },
  },
  {
    name: 'get_pipeline_summary',
    description: 'Get aggregate pipeline metrics: total value, weighted forecast, breakdown by stage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        owner: { type: 'string', description: 'Optional: filter by sales rep name' },
      },
      required: [],
    },
  },
  {
    name: 'update_crm_record',
    description: 'Update a CRM record. REQUIRES HUMAN APPROVAL for opportunities over $100k. Use for updating stage, next steps, amounts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        recordId: { type: 'string', description: 'The CRM record ID to update' },
        updates: { type: 'object', description: 'Fields to update as key-value pairs' },
        reason: { type: 'string', description: 'Business reason for this update' },
      },
      required: ['recordId', 'updates', 'reason'],
    },
  },
]

export async function executeCrmTool(toolName: string, toolInput: Record<string, unknown>) {
  switch (toolName) {
    case 'query_accounts': {
      const records = await prisma.crmRecord.findMany({ where: { type: 'ACCOUNT' } })
      let results = records.map(r => ({ id: r.id, name: r.name, ...(r.data as object) }))

      const input = toolInput as { search?: string; stage?: string; minHealthScore?: number; maxHealthScore?: number; owner?: string }
      if (input.search) results = results.filter((r: Record<string, unknown>) => (r.name as string).toLowerCase().includes(input.search!.toLowerCase()))
      if (input.stage) results = results.filter((r: Record<string, unknown>) => r.stage === input.stage)
      if (input.owner) results = results.filter((r: Record<string, unknown>) => (r.owner as string)?.toLowerCase().includes(input.owner!.toLowerCase()))
      if (input.minHealthScore !== undefined) results = results.filter((r: Record<string, unknown>) => (r.healthScore as number) >= input.minHealthScore!)
      if (input.maxHealthScore !== undefined) results = results.filter((r: Record<string, unknown>) => (r.healthScore as number) <= input.maxHealthScore!)

      return { accounts: results, total: results.length }
    }

    case 'query_opportunities': {
      const records = await prisma.crmRecord.findMany({ where: { type: 'OPPORTUNITY' } })
      let results = records.map(r => ({ id: r.id, name: r.name, ...(r.data as object) }))

      const input = toolInput as { minAmount?: number; stage?: string; owner?: string; closingBefore?: string }
      if (input.minAmount !== undefined) results = results.filter((r: Record<string, unknown>) => (r.amount as number) >= input.minAmount!)
      if (input.stage) results = results.filter((r: Record<string, unknown>) => r.stage === input.stage)
      if (input.owner) results = results.filter((r: Record<string, unknown>) => (r.owner as string)?.toLowerCase().includes(input.owner!.toLowerCase()))
      if (input.closingBefore) results = results.filter((r: Record<string, unknown>) => new Date(r.closeDate as string) < new Date(input.closingBefore!))

      return { opportunities: results, total: results.length }
    }

    case 'get_pipeline_summary': {
      const records = await prisma.crmRecord.findMany({ where: { type: 'OPPORTUNITY' } })
      const opps = records.map(r => ({ ...(r.data as Record<string, unknown>) }))

      const input = toolInput as { owner?: string }
      const filtered = input.owner ? opps.filter(o => (o.owner as string)?.toLowerCase().includes(input.owner!.toLowerCase())) : opps

      const byStage: Record<string, { count: number; value: number }> = {}
      let totalValue = 0
      let weightedValue = 0

      for (const opp of filtered) {
        const stage = opp.stage as string
        const amount = opp.amount as number
        const prob = (opp.probability as number) / 100

        totalValue += amount
        weightedValue += amount * prob

        if (!byStage[stage]) byStage[stage] = { count: 0, value: 0 }
        byStage[stage].count++
        byStage[stage].value += amount
      }

      return {
        totalOpportunities: filtered.length,
        totalValue,
        weightedValue: Math.round(weightedValue),
        byStage: Object.entries(byStage).map(([stage, d]) => ({ stage, ...d })),
      }
    }

    case 'update_crm_record': {
      const input = toolInput as { recordId: string; updates: Record<string, unknown>; reason: string }
      const existing = await prisma.crmRecord.findUnique({ where: { id: input.recordId } })
      if (!existing) return { error: 'Record not found' }

      const updated = await prisma.crmRecord.update({
        where: { id: input.recordId },
        data: { data: { ...(existing.data as Record<string, unknown>), ...input.updates } as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
      })
      return { success: true, record: { id: updated.id, name: updated.name, data: updated.data } }
    }

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

// Tools that require human approval
export const APPROVAL_REQUIRED_TOOLS = new Set(['update_crm_record'])

export function requiresApproval(toolName: string, toolInput: Record<string, unknown>): boolean {
  if (!APPROVAL_REQUIRED_TOOLS.has(toolName)) return false
  // Require approval for all CRM writes (configurable threshold)
  return true
}

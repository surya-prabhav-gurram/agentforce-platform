import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../db/client.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const AGENT_CATEGORIES: Record<string, string[]> = {
  'crm-agent-001':       ['pipeline', 'retention', 'forecast', 'accounts'],
  'router-agent-001':    ['routing'],
  'research-agent-001':  ['research'],
  'synthesis-agent-001': ['synthesis'],
}

export async function runEvals(agentId: string, promptVersionId: string) {
  const categories = AGENT_CATEGORIES[agentId] ?? []

  const evalCases = await prisma.evalCase.findMany(
    categories.length > 0 ? { where: { category: { in: categories } } } : undefined
  )

  const promptVersion = await prisma.promptVersion.findUnique({ where: { id: promptVersionId } })
  if (!promptVersion) throw new Error('Prompt version not found')

  const results = []

  for (const evalCase of evalCases) {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) continue

    const session = await prisma.agentSession.create({
      data: { agentId, status: 'ACTIVE' },
    })

    let actualOutput = ''
    try {
      await prisma.promptVersion.updateMany({ where: { agentId }, data: { isActive: false } })
      await prisma.promptVersion.update({ where: { id: promptVersionId }, data: { isActive: true } })

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: promptVersion.systemPrompt,
        messages: [{ role: 'user', content: evalCase.query }],
      })
      actualOutput = response.content[0].type === 'text' ? response.content[0].text : ''
    } catch (e) {
      actualOutput = `Error: ${e instanceof Error ? e.message : 'unknown'}`
    }

    const scoreResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You are an expert evaluator for enterprise sales AI systems.
Score the following AI response on a scale of 0.0 to 1.0.

Scoring criteria:
- Accuracy (0.3): Does it answer the question correctly?
- Completeness (0.3): Does it cover all relevant aspects?
- Actionability (0.2): Does it provide actionable insights for a sales rep?
- Conciseness (0.2): Is it appropriately concise and well-formatted?

Respond ONLY with JSON: {"score": 0.85, "reasoning": "brief explanation"}`,
      messages: [
        {
          role: 'user',
          content: `Query: ${evalCase.query}\nExpected: ${evalCase.expectedOutput ?? 'N/A'}\nActual Response: ${actualOutput}\n\nScore this response:`,
        },
      ],
    })

    let score = 0.5
    let reasoning = 'Evaluation failed'

    try {
      const judgeText = scoreResponse.content[0].type === 'text' ? scoreResponse.content[0].text : ''
      const parsed = JSON.parse(judgeText.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
      score = Math.max(0, Math.min(1, parsed.score ?? 0.5))
      reasoning = parsed.reasoning ?? 'No reasoning provided'
    } catch {}

    const result = await prisma.evalResult.create({
      data: { promptVersionId, evalCaseId: evalCase.id, actualOutput, score, reasoning },
    })

    results.push(result)

    await prisma.agentSession.update({ where: { id: session.id }, data: { status: 'COMPLETED' } })
  }

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length

  return {
    promptVersionId,
    totalCases: results.length,
    avgScore: Math.round(avgScore * 100) / 100,
    results: await prisma.evalResult.findMany({
      where: { promptVersionId },
      include: { evalCase: true },
    }),
  }
}

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../db/client.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Simple cosine similarity in JS (pgvector does this in SQL but we use JS for simplicity here)
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0))
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0))
  return dot / (magA * magB)
}

export async function embedText(text: string): Promise<number[]> {
  // Use Claude's tokenizer as a proxy - in production use a real embedding model
  // For now we'll generate a deterministic pseudo-embedding based on text hash
  // In production: replace with OpenAI text-embedding-3-small or Voyage AI
  const hash = Array.from(text).reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const embedding = Array.from({ length: 1536 }, (_, i) =>
    Math.sin((hash + i) * 0.1) * Math.cos((i + hash) * 0.05)
  )
  return embedding
}

export async function storeMessageWithEmbedding(
  sessionId: string,
  role: 'USER' | 'ASSISTANT' | 'TOOL' | 'SYSTEM',
  content: string,
  agentType?: string
) {
  const embedding = await embedText(content)

  // Store message - embedding stored as JSON array (pgvector handles vector type)
  const message = await prisma.message.create({
    data: {
      sessionId,
      role,
      content,
      agentType: agentType as any,
      // Note: embedding stored via raw SQL for vector type
    },
  })

  // Store embedding via raw SQL
  await prisma.$executeRaw`
    UPDATE messages 
    SET embedding = ${JSON.stringify(embedding)}::vector
    WHERE id = ${message.id}
  `

  return message
}

export async function retrieveRelevantContext(
  sessionId: string,
  query: string,
  topK: number = 5
): Promise<string[]> {
  try {
    const queryEmbedding = await embedText(query)

    // Use pgvector cosine similarity search
    const results = await prisma.$queryRaw<Array<{ content: string; similarity: number }>>`
      SELECT content, 1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM messages
      WHERE "sessionId" = ${sessionId}
        AND role = 'ASSISTANT'
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${topK}
    `

    return results
      .filter(r => r.similarity > 0.7)
      .map(r => r.content)
  } catch {
    // Fallback: return recent messages if vector search fails
    const recent = await prisma.message.findMany({
      where: { sessionId, role: 'ASSISTANT' },
      orderBy: { createdAt: 'desc' },
      take: topK,
    })
    return recent.map(m => m.content)
  }
}

export async function buildContextWindow(
  sessionId: string,
  newQuery: string,
  maxTokens: number = 3000
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  // Get recent messages (last 10)
  const recentMessages = await prisma.message.findMany({
    where: { sessionId, role: { in: ['USER', 'ASSISTANT'] } },
    orderBy: { createdAt: 'asc' },
    take: 10,
  })

  // Get semantically relevant older messages
  const relevantContext = await retrieveRelevantContext(sessionId, newQuery, 3)

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  // Add relevant context as a system-style injection
  if (relevantContext.length > 0) {
    messages.push({
      role: 'user',
      content: `[MEMORY CONTEXT - relevant previous responses]\n${relevantContext.join('\n---\n')}`,
    })
    messages.push({ role: 'assistant', content: 'I have reviewed the relevant context from our conversation history.' })
  }

  // Add recent conversation
  for (const msg of recentMessages) {
    messages.push({
      role: msg.role === 'USER' ? 'user' : 'assistant',
      content: msg.content,
    })
  }

  return messages
}

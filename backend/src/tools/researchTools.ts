// Research tools - in production these would call real APIs
// For demo purposes they return simulated data

export const researchTools = [
  {
    name: 'web_search',
    description: 'Search the web for recent news, company information, market data, and competitive intelligence.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        recency: { type: 'string', enum: ['day', 'week', 'month'], description: 'How recent results should be' },
      },
      required: ['query'],
    },
  },
  {
    name: 'extract_key_facts',
    description: 'Extract and structure key facts from a company or topic for sales intelligence.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string', description: 'Company name or topic to research' },
        focusAreas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Areas to focus on: financials, leadership, recent_news, competitors, technology_stack',
        },
      },
      required: ['topic'],
    },
  },
]

const SIMULATED_INTELLIGENCE: Record<string, unknown> = {
  'globalretail inc': {
    recentNews: [
      'GlobalRetail Inc announced a $50M digital transformation initiative in Q1 2026',
      'New CTO hired from Amazon — digital-native background, strong cloud mandate',
      'Struggling with inventory visibility across 200+ store locations',
    ],
    competitors: ['RetailCo', 'MegaStore', 'ShopDirect'],
    techStack: ['SAP ERP', 'Legacy WMS', 'Custom POS'],
    painPoints: ['Real-time inventory sync', 'Omnichannel customer experience', 'Supply chain visibility'],
    buyingSignals: ['Active RFP process for retail intelligence platform', 'Recent budget approval for Q2-Q3'],
  },
  'medtech solutions': {
    recentNews: [
      'MedTech Solutions received FDA clearance for new diagnostic device line',
      'Expanding into European markets — compliance complexity increasing',
      'Hiring surge: 150 new positions posted in last 30 days',
    ],
    competitors: ['MedCorp', 'HealthTech Pro'],
    techStack: ['Salesforce Health Cloud (basic tier)', 'Epic integration (partial)'],
    painPoints: ['Regulatory compliance tracking', 'Field service coordination', 'Clinical trial data management'],
    buyingSignals: ['Outgrown current Salesforce tier', 'VP Sales mentioned "needing better forecasting" on LinkedIn'],
  },
}

export async function executeResearchTool(toolName: string, toolInput: Record<string, unknown>) {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800))

  switch (toolName) {
    case 'web_search': {
      const input = toolInput as { query: string; recency?: string }
      const queryLower = input.query.toLowerCase()

      // Find matching simulated data
      for (const [key, data] of Object.entries(SIMULATED_INTELLIGENCE)) {
        if (queryLower.includes(key.split(' ')[0])) {
          const intel = data as Record<string, unknown>
          return {
            query: input.query,
            results: [
              { title: `${key} — Recent Developments`, snippet: (intel.recentNews as string[])[0], source: 'Reuters', date: '2026-05-28' },
              { title: `${key} — Market Analysis`, snippet: `Company shows strong buying signals: ${(intel.buyingSignals as string[])[0]}`, source: 'Bloomberg', date: '2026-05-20' },
            ],
            summary: `Found ${2} relevant results for "${input.query}"`,
          }
        }
      }

      return {
        query: input.query,
        results: [
          { title: 'General Market Trends 2026', snippet: 'Enterprise software spending up 18% YoY driven by AI adoption', source: 'Gartner', date: '2026-05-15' },
        ],
        summary: 'Limited specific results found. General market context provided.',
      }
    }

    case 'extract_key_facts': {
      const input = toolInput as { topic: string; focusAreas?: string[] }
      const topicLower = input.topic.toLowerCase()

      for (const [key, data] of Object.entries(SIMULATED_INTELLIGENCE)) {
        if (topicLower.includes(key.split(' ')[0])) {
          return { topic: input.topic, intelligence: data, confidence: 'HIGH', lastUpdated: '2026-06-01' }
        }
      }

      return {
        topic: input.topic,
        intelligence: { note: 'Limited data available for this entity. Recommend direct outreach for discovery.' },
        confidence: 'LOW',
        lastUpdated: null,
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

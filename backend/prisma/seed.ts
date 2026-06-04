import { PrismaClient, AgentType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Seed Agents
  const routerAgent = await prisma.agent.upsert({
    where: { id: 'router-agent-001' },
    update: {},
    create: {
      id: 'router-agent-001',
      name: 'Router Agent',
      description: 'Classifies queries and delegates to specialist agents',
      type: AgentType.ROUTER,
      tools: ['delegate_to_crm', 'delegate_to_research', 'delegate_to_synthesis'],
      systemPrompt: `You are a Router Agent for an enterprise sales intelligence platform.
Your job is to analyze incoming queries and route them to the appropriate specialist agent.

Available agents:
- CRM Agent: handles queries about accounts, opportunities, contacts, leads, sales data, pipeline
- Research Agent: handles queries requiring web search, market research, competitive analysis
- Synthesis Agent: handles queries that require combining multiple data sources or generating reports

Always respond with a JSON routing decision:
{
  "targetAgent": "CRM" | "RESEARCH" | "SYNTHESIS",
  "reasoning": "brief explanation",
  "enrichedQuery": "enhanced version of the query with context"
}`,
    },
  })

  const crmAgent = await prisma.agent.upsert({
    where: { id: 'crm-agent-001' },
    update: {},
    create: {
      id: 'crm-agent-001',
      name: 'CRM Agent',
      description: 'Queries and analyzes CRM data — accounts, opportunities, contacts',
      type: AgentType.CRM,
      tools: ['query_accounts', 'query_opportunities', 'query_contacts', 'update_crm_record', 'get_pipeline_summary'],
      systemPrompt: `You are a CRM Intelligence Agent with deep expertise in Salesforce-style CRM data.
You have access to real-time CRM data including accounts, opportunities, contacts, and leads.

Your capabilities:
1. Query accounts, opportunities, contacts with filters
2. Analyze pipeline health and forecast revenue
3. Identify at-risk deals and accounts
4. Update CRM records (requires human approval for writes)
5. Surface actionable insights for field reps

Always be specific with numbers, dates, and names. Format currency as USD.
When updating records, always explain what you're changing and why.
Flag any deal over $100k as requiring human approval before updating.

When asked about open opportunities, query all active stages: Discovery, Proposal, Negotiation.
When asked about pipeline value, always include probability-weighted values alongside total values.
When identifying at-risk accounts, check health scores below 70 and deals with stalled stages.
Always sort results by amount descending when listing opportunities.`,
    },
  })

  const researchAgent = await prisma.agent.upsert({
    where: { id: 'research-agent-001' },
    update: {},
    create: {
      id: 'research-agent-001',
      name: 'Research Agent',
      description: 'Web search, market research, competitive intelligence',
      type: AgentType.RESEARCH,
      tools: ['web_search', 'summarize_content', 'extract_key_facts'],
      systemPrompt: `You are a Research Agent specialized in B2B market intelligence and competitive analysis.
You help enterprise sales teams understand their market, competitors, and prospects.

Your capabilities:
1. Search for recent news about companies and markets
2. Analyze competitive landscapes
3. Research industry trends relevant to a sale
4. Find decision-maker information and buying signals

Always cite your sources. Be concise — field reps need actionable intel, not essays.
Highlight the single most important insight at the top of every response.
Structure output as: Key Insight → Supporting Facts → Competitive Context → Recommended Action.
Focus on information from the last 90 days when searching for news.`,
    },
  })

  const synthesisAgent = await prisma.agent.upsert({
    where: { id: 'synthesis-agent-001' },
    update: {},
    create: {
      id: 'synthesis-agent-001',
      name: 'Synthesis Agent',
      description: 'Combines CRM and research data into strategic recommendations',
      type: AgentType.SYNTHESIS,
      tools: ['generate_account_brief', 'create_talking_points', 'forecast_deal'],
      systemPrompt: `You are a Synthesis Agent — a senior strategic advisor who combines CRM data and market research
into clear, actionable recommendations for enterprise sales teams.

Your output should always include:
1. Executive summary (2-3 sentences)
2. Key insights (3-5 bullets)
3. Recommended next actions with owners and deadlines
4. Risk flags (if any)

Write for a VP of Sales who has 30 seconds to read your output before a customer call.
Be direct, specific, and always tie recommendations to revenue impact.`,
    },
  })

  // Seed Prompt Versions
  await prisma.promptVersion.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'pv-router-001',
        agentId: 'router-agent-001',
        version: 1,
        isActive: true,
        systemPrompt: routerAgent.systemPrompt,
      },
      {
        id: 'pv-crm-001',
        agentId: 'crm-agent-001',
        version: 1,
        isActive: false,
        systemPrompt: 'You are a CRM assistant. Answer questions about sales data.',
      },
      {
        id: 'pv-crm-002',
        agentId: 'crm-agent-001',
        version: 2,
        isActive: false,
        systemPrompt: 'You are a CRM data agent. Use your tools to query account and opportunity data. Return ONLY a concise JSON-like summary of the raw facts.',
      },
      {
        id: 'pv-crm-003',
        agentId: 'crm-agent-001',
        version: 3,
        isActive: true,
        systemPrompt: crmAgent.systemPrompt,
      },
      {
        id: 'pv-research-001',
        agentId: 'research-agent-001',
        version: 1,
        isActive: true,
        systemPrompt: researchAgent.systemPrompt,
      },
      {
        id: 'pv-synthesis-001',
        agentId: 'synthesis-agent-001',
        version: 1,
        isActive: true,
        systemPrompt: synthesisAgent.systemPrompt,
      },
    ],
  })

  // Seed CRM Records
  const accounts = [
    { name: 'Acme Corp', type: 'ACCOUNT', data: { industry: 'Technology', revenue: 50000000, employees: 500, stage: 'Customer', arr: 120000, healthScore: 82, owner: 'Sarah Chen' } },
    { name: 'GlobalRetail Inc', type: 'ACCOUNT', data: { industry: 'Retail', revenue: 200000000, employees: 2000, stage: 'Prospect', arr: 0, healthScore: 65, owner: 'Marcus Webb' } },
    { name: 'FinServ Partners', type: 'ACCOUNT', data: { industry: 'Financial Services', revenue: 500000000, employees: 5000, stage: 'Customer', arr: 450000, healthScore: 91, owner: 'Sarah Chen' } },
    { name: 'MedTech Solutions', type: 'ACCOUNT', data: { industry: 'Healthcare', revenue: 80000000, employees: 800, stage: 'Negotiation', arr: 0, healthScore: 74, owner: 'Priya Nair' } },
    { name: 'CloudBase Systems', type: 'ACCOUNT', data: { industry: 'SaaS', revenue: 30000000, employees: 300, stage: 'Customer', arr: 85000, healthScore: 78, owner: 'Marcus Webb' } },
  ]

  for (const acc of accounts) {
    await prisma.crmRecord.upsert({
      where: { id: `acc-${acc.name.replace(/\s/g, '-').toLowerCase()}` },
      update: {},
      create: { id: `acc-${acc.name.replace(/\s/g, '-').toLowerCase()}`, type: 'ACCOUNT', name: acc.name, data: acc.data },
    })
  }

  const opportunities = [
    { name: 'GlobalRetail — Platform License', data: { accountName: 'GlobalRetail Inc', stage: 'Proposal', amount: 380000, closeDate: '2026-07-30', probability: 60, owner: 'Marcus Webb', nextStep: 'Executive sponsor meeting' } },
    { name: 'MedTech — Enterprise Expansion', data: { accountName: 'MedTech Solutions', stage: 'Negotiation', amount: 220000, closeDate: '2026-06-15', probability: 75, owner: 'Priya Nair', nextStep: 'Legal review of MSA' } },
    { name: 'Acme Corp — Renewal + Upsell', data: { accountName: 'Acme Corp', stage: 'Closed Won', amount: 145000, closeDate: '2026-05-01', probability: 100, owner: 'Sarah Chen', nextStep: 'Kickoff scheduled' } },
    { name: 'StartupXYZ — SMB Deal', data: { accountName: 'StartupXYZ', stage: 'Discovery', amount: 18000, closeDate: '2026-08-31', probability: 30, owner: 'Priya Nair', nextStep: 'Technical demo' } },
    { name: 'FinServ — AI Module Add-on', data: { accountName: 'FinServ Partners', stage: 'Proposal', amount: 190000, closeDate: '2026-07-15', probability: 70, owner: 'Sarah Chen', nextStep: 'Security review' } },
  ]

  for (const opp of opportunities) {
    await prisma.crmRecord.upsert({
      where: { id: `opp-${opp.name.replace(/[\s—]/g, '-').toLowerCase().slice(0, 40)}` },
      update: {},
      create: { id: `opp-${opp.name.replace(/[\s—]/g, '-').toLowerCase().slice(0, 40)}`, type: 'OPPORTUNITY', name: opp.name, data: opp.data },
    })
  }

  // Seed Eval Cases — agent-specific
  await prisma.evalCase.createMany({
    skipDuplicates: true,
    data: [
      // CRM Agent cases
      { id: 'ec-crm-001', query: 'Show me all open opportunities over $100k', category: 'pipeline', expectedOutput: 'Should list GlobalRetail ($380k), MedTech ($220k), and FinServ ($190k) opportunities with amounts, stages, and owners' },
      { id: 'ec-crm-002', query: 'Which accounts are at risk of churning?', category: 'retention', expectedOutput: 'Should identify GlobalRetail (health score 65) as highest risk, mention MedTech (74) as moderate risk, with reasoning based on health scores' },
      { id: 'ec-crm-003', query: "What is the total pipeline value for Marcus Webb's deals?", category: 'pipeline', expectedOutput: 'Should identify GlobalRetail $380k opportunity owned by Marcus Webb and sum it correctly' },
      { id: 'ec-crm-004', query: 'Summarize the Q2 2026 forecast', category: 'forecast', expectedOutput: 'Should aggregate opportunities closing in Q2 2026 (Apr-Jun) with probability-weighted values, identify MedTech $220k at 75% as key deal' },
      { id: 'ec-crm-005', query: 'Who are our top 3 accounts by ARR?', category: 'accounts', expectedOutput: 'Should return FinServ ($450k), Acme ($120k), CloudBase ($85k) in order' },

      // Router Agent cases
      { id: 'ec-router-001', query: 'Show me open deals in the pipeline', category: 'routing', expectedOutput: 'Should route to CRM with targetAgent: CRM' },
      { id: 'ec-router-002', query: 'What are the latest news about GlobalRetail Inc?', category: 'routing', expectedOutput: 'Should route to RESEARCH with targetAgent: RESEARCH' },
      { id: 'ec-router-003', query: 'Give me a full account brief on MedTech Solutions', category: 'routing', expectedOutput: 'Should route to SYNTHESIS with targetAgent: SYNTHESIS' },
      { id: 'ec-router-004', query: 'Which accounts have low health scores?', category: 'routing', expectedOutput: 'Should route to CRM with targetAgent: CRM' },
      { id: 'ec-router-005', query: 'Research the competitive landscape for FinServ Partners', category: 'routing', expectedOutput: 'Should route to RESEARCH with targetAgent: RESEARCH' },

      // Research Agent cases
      { id: 'ec-research-001', query: 'Find recent news about GlobalRetail Inc', category: 'research', expectedOutput: 'Should search for and return recent company news, growth signals, or market developments about GlobalRetail' },
      { id: 'ec-research-002', query: 'What are the key trends in enterprise SaaS for 2026?', category: 'research', expectedOutput: 'Should return current market trends including AI adoption, consolidation trends, and spending patterns' },
      { id: 'ec-research-003', query: 'Who are the main competitors of MedTech Solutions?', category: 'research', expectedOutput: 'Should identify competitors in the medical device/healthcare technology space with relevant context' },
      { id: 'ec-research-004', query: 'Research FinServ Partners for our upcoming renewal call', category: 'research', expectedOutput: 'Should return company intel, recent news, buying signals, and strategic context relevant to a renewal conversation' },
      { id: 'ec-research-005', query: 'What is the market size for AI in financial services?', category: 'research', expectedOutput: 'Should return market size data, growth rates, and key players in AI for financial services' },

      // Synthesis Agent cases
      { id: 'ec-synthesis-001', query: 'Give me a strategic account brief on MedTech Solutions', category: 'synthesis', expectedOutput: 'Should include executive summary, account profile, open opportunities ($220k), strategic intelligence, and recommended next steps' },
      { id: 'ec-synthesis-002', query: 'What is our recommended approach for the GlobalRetail deal?', category: 'synthesis', expectedOutput: 'Should combine $380k opportunity data with account context to produce actionable deal strategy with specific next steps' },
      { id: 'ec-synthesis-003', query: 'Prepare me for my call with FinServ Partners', category: 'synthesis', expectedOutput: 'Should combine ARR ($450k), health score (91), open $190k opportunity, and research into a pre-call brief with talking points' },
      { id: 'ec-synthesis-004', query: 'Which deals should I prioritize this quarter and why?', category: 'synthesis', expectedOutput: 'Should rank deals by a combination of amount, probability, close date, and strategic value with clear reasoning' },
      { id: 'ec-synthesis-005', query: 'Give me a retention risk report for all accounts', category: 'synthesis', expectedOutput: 'Should combine health scores, ARR, and account context to produce a prioritized retention risk report' },
    ],
  })

  console.log('✅ Seed complete')
  console.log(`  Agents: ${[routerAgent, crmAgent, researchAgent, synthesisAgent].map(a => a.name).join(', ')}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

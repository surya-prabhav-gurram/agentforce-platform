# Agentforce Field Intelligence Platform

A production-grade multi-agent system built on Claude, GraphQL subscriptions, pgvector, and TypeScript — simulating what Salesforce deploys for Fortune 500 clients.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend (3000)                    │
│   Agent Chat │ Pipeline Dashboard │ Prompt Evals            │
└──────────────────────┬──────────────────────────────────────┘
                       │ GraphQL + WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                  Apollo Server (4000)                        │
│          Queries │ Mutations │ Subscriptions                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Multi-Agent Orchestrator                        │
│                                                             │
│  ┌──────────┐    ┌─────────────────┐    ┌───────────────┐  │
│  │  Router  │───▶│   CRM Agent     │    │ Research Agent│  │
│  │  Agent   │    │ (tools + HITL)  │    │ (web_search,  │  │
│  │          │───▶│                 │    │  extract_facts│  │
│  │          │    └─────────────────┘    └───────────────┘  │
│  │          │───▶  Synthesis Agent (combines outputs)       │
│  └──────────┘                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                 PostgreSQL + pgvector                        │
│  agents │ sessions │ messages (vector) │ crm_records         │
│  prompt_versions │ eval_cases │ eval_results                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

| Feature | Description |
|---|---|
| **Multi-agent routing** | Router → CRM / Research / Synthesis with parallel execution |
| **Real-time streaming** | Live agent trace over GraphQL WebSocket subscriptions — per-token streaming |
| **Human-in-the-loop** | Approval flow before destructive CRM writes — 5-minute window |
| **Vector memory** | pgvector RAG on conversation history for contextual responses |
| **Prompt versioning** | Create, activate, and compare prompt versions per agent |
| **LLM-as-judge evals** | Agent-specific eval cases scored by Claude with reasoning |
| **New Chat button** | Start a fresh session without page refresh |
| **Markdown rendering** | Tables, headers, numbered lists, bullets, checkboxes in chat |
| **TypeScript end-to-end** | Schema-first GraphQL with full type safety |

---

## Quick Start

### Prerequisites
- Docker Desktop
- Anthropic API key — [console.anthropic.com](https://console.anthropic.com)

### Run

```bash
# 1. Clone / unzip the project
cd agentforce-platform

# 2. Add your API key to .env
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env

# 3. Start everything
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000)

First run takes ~2 minutes — Postgres starts, migrations run, and the DB is seeded automatically.

### Restart fresh

```bash
# Stop all services and wipe the database
docker compose down -v && docker compose up --build
```

### Development (without Docker for app)

```bash
# Requires Node 20+ and Docker for Postgres only
./scripts/dev.sh
```

---

## Testing the App

### Agent Chat

| What to test | Query to send |
|---|---|
| CRM pipeline query | `Show me all open opportunities over $100k` |
| At-risk accounts | `Which accounts are at risk of churning?` |
| Research routing | `What are the latest market trends in enterprise software?` |
| Full account brief | `Give me a full account brief on MedTech Solutions` |
| Human-in-the-loop | `Update the close date of the GlobalRetail Platform License opportunity to August 15, 2026` |

For the approval flow test: wait for the **Approval Required** card → click **Approve** → agent confirms the update.

Use the **+** button (bottom left of input) to start a fresh session at any time.

### Prompt Evals

1. Go to **Prompt Evals** in the sidebar
2. Select an agent
3. Click **▶ Run Evals** on any prompt version
4. Each agent runs against its own relevant test cases (5 per agent, 20 total)

Eval cases are agent-specific:
- **Router Agent** — tests correct routing decisions (CRM / RESEARCH / SYNTHESIS)
- **CRM Agent** — pipeline, retention, forecast, and account queries
- **Research Agent** — market research, competitive intel, company news
- **Synthesis Agent** — account briefs, deal strategy, pre-call prep

### Pipeline Dashboard

Click **Pipeline** in the sidebar to see a live summary of all CRM opportunities — total value, weighted pipeline, stage breakdown, and at-risk count.

---

## Project Structure

```
agentforce-platform/
├── backend/
│   ├── src/
│   │   ├── agents/         # orchestrator.ts — multi-agent core
│   │   ├── tools/          # crmTools.ts, researchTools.ts
│   │   ├── memory/         # vectorMemory.ts — pgvector RAG
│   │   ├── evals/          # evalRunner.ts — LLM-as-judge (agent-filtered)
│   │   ├── graphql/
│   │   │   ├── schema/     # schema.graphql (SDL-first)
│   │   │   └── resolvers/  # index.ts
│   │   └── db/             # Prisma client
│   └── prisma/
│       ├── schema.prisma   # DB schema with pgvector
│       └── seed.ts         # Agents, CRM data, 20 eval cases
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── chat/       # AgentChat.tsx — streaming chat + approval UI
│       │   ├── dashboard/  # PipelineDashboard.tsx
│       │   └── evals/      # EvalsPanel.tsx
│       └── lib/
│           ├── apolloClient.ts   # WebSocket split link
│           └── graphql.ts        # All GQL operations
├── python-services/
│   └── embeddings_service.py    # pgvector embedding pipeline
├── docker-compose.yml
└── .env.example
```

---

## Deployment

### Railway (recommended)

```bash
brew install railway
railway login
railway init
railway up
```

Add a PostgreSQL database from the Railway dashboard, then set:
```
ANTHROPIC_API_KEY=your-key
JWT_SECRET=a-random-string
```

### VPS (DigitalOcean / AWS EC2)

```bash
git clone your-repo && cd agentforce-platform
cp .env.example .env   # fill in ANTHROPIC_API_KEY
docker compose up -d
```

---

## Key Technical Decisions

**Why GraphQL subscriptions over REST + polling?**
The agent trace UI needs per-token streaming with typed events (`ROUTING`, `TOOL_CALL`, `APPROVAL_REQUIRED`...). Subscriptions over WebSocket give a single persistent connection with real-time push — no polling, no SSE fallback hacks.

**Why pgvector instead of a dedicated vector DB?**
Production simplicity. One Postgres instance handles relational data and vector search. The `embedding <=>` cosine distance operator is a single SQL expression — no extra infrastructure.

**Why human-in-the-loop before CRM writes?**
Agentic systems fail in production by taking irreversible actions on bad data. HITL is the safety layer — the agent pauses, emits an `APPROVAL_REQUIRED` event over the subscription, and the UI blocks until the user approves or rejects within a 5-minute window.

**Why agent-specific eval cases?**
Running all 20 cases against every agent produces meaningless scores — a Research Agent shouldn't be judged on CRM pipeline queries. Each agent is evaluated only on cases matching its domain, making scores actionable and comparable across prompt versions.

---

## Interview Talking Points

1. **Multi-agent handoff** — The Router Agent classifies queries as JSON `{targetAgent, reasoning, enrichedQuery}`. For complex queries it runs CRM + Research agents in parallel with `Promise.all`, then passes both outputs to Synthesis.

2. **GraphQL subscriptions depth** — The `agentEvent` subscription carries 8 event types with discriminated union semantics. The frontend renders a live agent trace panel — active agent, every tool call + result, and tokens streaming in real time.

3. **Prompt versioning + evals** — Every system prompt is versioned. The eval runner sends each test case to the agent, scores the output with Claude-as-judge (`{score, reasoning}`), and only runs cases relevant to that agent's domain.

4. **Agentic tool use correctness** — The CRM agent loop collects all `tool_use` blocks from a single response and returns them as one batched `tool_result` message — matching the Anthropic API requirement that every `tool_use` id has a corresponding `tool_result` in the immediately following message.

5. **HITL implementation** — After emitting `APPROVAL_REQUIRED`, the orchestrator polls the DB every second for up to 5 minutes. The frontend `resolveApproval` mutation updates the record status, which the polling loop detects to unblock execution.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Your Anthropic API key |
| `DATABASE_URL` | auto | Injected by Docker Compose |
| `JWT_SECRET` | optional | Change in production |
| `PORT` | optional | Backend port (default 4000) |

---

## Known Setup Notes

- **OpenSSL on Alpine** — The backend Dockerfile installs `openssl` via `apk`, required for Prisma on `node:20-alpine`.
- **GraphQL schema copy** — `tsc` doesn't copy `.graphql` files to `dist/`. The Dockerfile explicitly runs `cp -r src/graphql/schema dist/graphql/schema` after the build step.
- **graphql-ws v5** — Uses `makeServer` API with manual WebSocket wiring, not the older `useServer` from `graphql-ws/lib/use/ws`.
- **Stale session memory** — If the agent references a previous attempt, use the **+** button to start a fresh session rather than refreshing the page.

---

*Built by Surya Prabhav Gurram*

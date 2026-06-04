-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('ROUTER', 'CRM', 'RESEARCH', 'SYNTHESIS');
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABORTED');
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL', 'SYSTEM');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "CrmType" AS ENUM ('ACCOUNT', 'OPPORTUNITY', 'CONTACT', 'LEAD');

-- CreateTable agents
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "AgentType" NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "tools" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable agent_sessions
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable messages
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "toolResults" JSONB,
    "agentType" "AgentType",
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable approval_requests
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolInput" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable prompt_versions
CREATE TABLE "prompt_versions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prompt_versions_agentId_version_key" UNIQUE ("agentId", "version")
);

-- CreateTable eval_cases
CREATE TABLE "eval_cases" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "expectedOutput" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eval_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable eval_results
CREATE TABLE "eval_results" (
    "id" TEXT NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "evalCaseId" TEXT NOT NULL,
    "actualOutput" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eval_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable crm_records
CREATE TABLE "crm_records" (
    "id" TEXT NOT NULL,
    "type" "CrmType" NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_records_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "prompt_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_evalCaseId_fkey" FOREIGN KEY ("evalCaseId") REFERENCES "eval_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

import { gql } from '@apollo/client'

export const START_SESSION = gql`
  mutation StartSession {
    startSession {
      id
      status
      createdAt
      agent { id name type }
    }
  }
`

export const SEND_MESSAGE = gql`
  mutation SendMessage($sessionId: ID!, $content: String!) {
    sendMessage(sessionId: $sessionId, content: $content) {
      id role content createdAt
    }
  }
`

export const AGENT_EVENT_SUBSCRIPTION = gql`
  subscription AgentEvent($sessionId: ID!) {
    agentEvent(sessionId: $sessionId) {
      sessionId type agentType content isComplete error
      toolCall { toolName toolInput }
      toolResult { toolName result }
      approval { id sessionId toolName toolInput status }
    }
  }
`

export const APPROVAL_SUBSCRIPTION = gql`
  subscription ApprovalRequired($sessionId: ID!) {
    approvalRequired(sessionId: $sessionId) {
      id sessionId toolName toolInput status createdAt
    }
  }
`

export const RESOLVE_APPROVAL = gql`
  mutation ResolveApproval($approvalId: ID!, $approved: Boolean!) {
    resolveApproval(approvalId: $approvalId, approved: $approved) {
      id status
    }
  }
`

export const GET_SESSIONS = gql`
  query GetSessions {
    sessions {
      id status createdAt
      agent { id name type }
    }
  }
`

export const GET_SESSION = gql`
  query GetSession($id: ID!) {
    session(id: $id) {
      id status createdAt
      agent { id name type }
      messages { id role content agentType createdAt }
    }
  }
`

export const GET_PIPELINE_SUMMARY = gql`
  query GetPipelineSummary {
    pipelineSummary {
      totalOpportunities totalValue weightedValue atRiskCount
      byStage { stage count value }
    }
  }
`

export const GET_CRM_RECORDS = gql`
  query GetCrmRecords($type: CrmType) {
    crmRecords(type: $type) {
      id type name data createdAt
    }
  }
`

export const GET_AGENTS = gql`
  query GetAgents {
    agents {
      id name description type systemPrompt tools createdAt
      promptVersions { id version isActive avgScore createdAt }
    }
  }
`

export const GET_PROMPT_VERSIONS = gql`
  query GetPromptVersions($agentId: ID!) {
    promptVersions(agentId: $agentId) {
      id version systemPrompt isActive avgScore createdAt
      evalResults {
        id score reasoning createdAt
        evalCase { id query category }
      }
    }
  }
`

export const CREATE_PROMPT_VERSION = gql`
  mutation CreatePromptVersion($agentId: ID!, $systemPrompt: String!) {
    createPromptVersion(agentId: $agentId, systemPrompt: $systemPrompt) {
      id version isActive createdAt
    }
  }
`

export const ACTIVATE_PROMPT_VERSION = gql`
  mutation ActivatePromptVersion($promptVersionId: ID!) {
    activatePromptVersion(promptVersionId: $promptVersionId) {
      id version isActive
    }
  }
`

export const RUN_EVALS = gql`
  mutation RunEvals($agentId: ID!, $promptVersionId: ID!) {
    runEvals(agentId: $agentId, promptVersionId: $promptVersionId) {
      promptVersionId totalCases avgScore
      results {
        id score reasoning actualOutput
        evalCase { id query category }
      }
    }
  }
`

export const GET_EVAL_CASES = gql`
  query GetEvalCases {
    evalCases { id query expectedOutput category }
  }
`

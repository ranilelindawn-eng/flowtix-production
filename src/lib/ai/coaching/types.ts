export type AICoachingCompetencyName =
  | 'discovery'
  | 'communication'
  | 'objection_handling'
  | 'product_knowledge'
  | 'rapport'
  | 'next_steps'
  | 'compliance'

export type AICoachingCompetency = {
  name: AICoachingCompetencyName
  score: number
  evidence: string[]
  feedback: string
}

export type AICoachingMoment = {
  type: 'positive' | 'improvement' | 'risk'
  excerpt: string
  explanation: string
  recommendation: string
}

export type AICoachingAction = {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
}

export type AICoachingResult = {
  overallScore: number
  confidence: number
  managerSummary: string
  strengths: string[]
  improvements: string[]
  competencies: AICoachingCompetency[]
  moments: AICoachingMoment[]
  actionPlan: AICoachingAction[]
  complianceFlags: string[]
}

export type PersistedAICoachingAnalysis = {
  id: string
  organization_id: string
  transcript_id: string
  call_id: string | null
  agent_user_id: string | null
  focus: string
  source_hash: string
  overall_score: number
  confidence: number
  manager_summary: string
  strengths: string[]
  improvements: string[]
  competencies: AICoachingCompetency[]
  moments: AICoachingMoment[]
  action_plan: AICoachingAction[]
  compliance_flags: string[]
  provider: string
  model: string | null
  prompt_key: string
  prompt_version: number
  provider_request_id: string | null
  input_tokens: number | null
  output_tokens: number | null
  latency_ms: number | null
  generation_key: string
  metadata: Record<string, unknown>
  created_by: string
  created_at: string
}

export type AITaskPriority = 'low' | 'medium' | 'high'
export type AITaskCategory = 'follow_up' | 'call' | 'email' | 'meeting' | 'research' | 'internal'
export type AITaskSuggestionStatus = 'pending' | 'accepted' | 'dismissed'

export type AITaskSuggestion = {
  title: string
  description: string
  priority: AITaskPriority
  category: AITaskCategory
  dueInDays: number
  rationale: string
}

export type AITaskGenerationResult = {
  tasks: AITaskSuggestion[]
}

export type PersistedAITaskSuggestion = {
  id: string
  organization_id: string
  contact_id: string | null
  call_id: string | null
  transcript_id: string | null
  title: string
  description: string
  priority: AITaskPriority
  category: AITaskCategory
  due_in_days: number
  suggested_due_at: string
  rationale: string
  status: AITaskSuggestionStatus
  accepted_at: string | null
  accepted_by: string | null
  accepted_task_id: string | null
  dismissed_at: string | null
  dismissed_by: string | null
  source_hash: string
  generation_key: string
  provider: string
  model: string | null
  prompt_key: string
  prompt_version: number
  provider_request_id: string | null
  input_tokens: number | null
  output_tokens: number | null
  latency_ms: number | null
  metadata: Record<string, unknown>
  created_by: string
  created_at: string
}

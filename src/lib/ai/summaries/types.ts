export type AISummarySentiment = 'positive' | 'neutral' | 'negative' | 'mixed'

export type AITranscriptSummary = {
  title: string
  summary: string
  keyPoints: string[]
  actionItems: string[]
  sentiment: AISummarySentiment
}

export type PersistedAISummary = {
  id: string
  organization_id: string
  transcript_id: string
  title: string | null
  summary: string
  key_points: string | null
  action_items: string | null
  sentiment: AISummarySentiment | null
  provider: string
  model: string | null
  prompt_key: string | null
  prompt_version: number | null
  provider_request_id: string | null
  input_tokens: number | null
  output_tokens: number | null
  latency_ms: number | null
  generation_status: 'completed' | 'failed' | 'manual'
  generation_key: string | null
  generated_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

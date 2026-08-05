export type AISentimentLabel = 'positive' | 'neutral' | 'negative' | 'mixed'

export type AISentimentEmotion = {
  name: string
  score: number
}

export type AISentimentSegment = {
  text: string
  label: AISentimentLabel
  score: number
  confidence: number
}

export type AISentimentResult = {
  label: AISentimentLabel
  score: number
  confidence: number
  intensity: number
  emotions: AISentimentEmotion[]
  drivers: string[]
  risks: string[]
  segments: AISentimentSegment[]
  rationale: string
}

export type PersistedAISentimentAnalysis = {
  id: string
  organization_id: string
  transcript_id: string | null
  call_id: string | null
  contact_id: string | null
  source_type: 'text' | 'transcript'
  source_hash: string
  label: AISentimentLabel
  score: number
  confidence: number
  intensity: number
  emotions: AISentimentEmotion[]
  drivers: string[]
  risks: string[]
  segments: AISentimentSegment[]
  rationale: string
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

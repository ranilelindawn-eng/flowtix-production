export type TranscriptProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type TranscriptSpeakerRole = 'agent' | 'customer' | 'supervisor' | 'unknown'

export type TranscriptProcessingSegment = {
  position: number
  speakerLabel: string
  speakerRole: TranscriptSpeakerRole
  text: string
  startMs: number | null
  endMs: number | null
  confidence: number | null
}

export type TranscriptProcessingResult = {
  normalizedContent: string
  redactedContent: string
  language: string
  speakerCount: number
  wordCount: number
  qualityScore: number
  confidence: number
  warnings: string[]
  segments: TranscriptProcessingSegment[]
}

export type TranscriptProcessingRun = {
  id: string
  organization_id: string
  transcript_id: string
  status: TranscriptProcessingStatus
  source_hash: string
  generation_key: string
  language: string
  speaker_count: number
  word_count: number
  quality_score: number
  confidence: number
  warnings: string[]
  provider: string
  model: string
  prompt_key: string
  prompt_version: number
  provider_request_id: string | null
  input_tokens: number | null
  output_tokens: number | null
  latency_ms: number
  error_message: string | null
  metadata: Record<string, unknown>
  created_by: string
  created_at: string
  completed_at: string | null
}

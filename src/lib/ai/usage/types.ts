export const AI_USAGE_FEATURES = [
  'chat', 'summary', 'sentiment', 'coaching', 'call_analysis', 'task_generation', 'email_generation',
  'transcript_processing', 'transcription', 'post_call_follow_up',
] as const

export type AIUsageFeature = (typeof AI_USAGE_FEATURES)[number]

export type AIUsageReservation = {
  id: string
  organizationId: string
  feature: AIUsageFeature
  status: 'reserved' | 'completed' | 'failed' | 'cancelled' | 'expired'
  idempotencyKey: string
}

export type AIUsageCompletion = {
  provider?: string | null
  model?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  costMicros?: number | null
  requestId?: string | null
  latencyMs?: number | null
  metadata?: Record<string, unknown>
}

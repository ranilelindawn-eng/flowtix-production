import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { generatePromptStructured } from '@/lib/ai/prompts'

import type {
  AISentimentEmotion,
  AISentimentLabel,
  AISentimentResult,
  AISentimentSegment,
  PersistedAISentimentAnalysis,
} from './types'

const MIN_CONTENT_LENGTH = 20
const MAX_CONTENT_LENGTH = 250_000
const LABELS: readonly AISentimentLabel[] = ['positive', 'neutral', 'negative', 'mixed']

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`AI sentiment ${field} is invalid.`)
  return value.trim().slice(0, maxLength)
}

function numberInRange(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`AI sentiment ${field} is invalid.`)
  }
  return Math.max(minimum, Math.min(maximum, value))
}

function label(value: unknown): AISentimentLabel {
  const normalized = typeof value === 'string' ? value.toLowerCase() : ''
  if (!LABELS.includes(normalized as AISentimentLabel)) {
    throw new Error('AI sentiment label is invalid.')
  }
  return normalized as AISentimentLabel
}

function stringList(value: unknown, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, maximumItems)
    .map((item) => item.trim().slice(0, maximumLength))
}

function emotions(value: unknown): AISentimentEmotion[] {
  if (!Array.isArray(value)) return []
  return value
    .map(record)
    .filter((item): item is Record<string, unknown> => item !== null)
    .slice(0, 12)
    .map((item) => ({
      name: text(item.name, 'emotion name', 80).toLowerCase(),
      score: numberInRange(item.score, 'emotion score', 0, 1),
    }))
}

function segments(value: unknown): AISentimentSegment[] {
  if (!Array.isArray(value)) return []
  return value
    .map(record)
    .filter((item): item is Record<string, unknown> => item !== null)
    .slice(0, 30)
    .map((item) => ({
      text: text(item.text, 'segment text', 2_000),
      label: label(item.label),
      score: numberInRange(item.score, 'segment score', -1, 1),
      confidence: numberInRange(item.confidence, 'segment confidence', 0, 1),
    }))
}

function validate(value: unknown): AISentimentResult {
  const candidate = record(value)
  if (!candidate) throw new Error('The AI provider returned an invalid sentiment analysis.')
  return {
    label: label(candidate.label),
    score: numberInRange(candidate.score, 'score', -1, 1),
    confidence: numberInRange(candidate.confidence, 'confidence', 0, 1),
    intensity: numberInRange(candidate.intensity, 'intensity', 0, 1),
    emotions: emotions(candidate.emotions),
    drivers: stringList(candidate.drivers, 20, 500),
    risks: stringList(candidate.risks, 20, 500),
    segments: segments(candidate.segments),
    rationale: text(candidate.rationale, 'rationale', 4_000),
  }
}

function createGenerationKey(input: {
  organizationId: string
  sourceType: string
  sourceHash: string
  promptVersion: number
}): string {
  return createHash('sha256')
    .update([input.organizationId, input.sourceType, input.sourceHash, input.promptVersion].join(':'))
    .digest('hex')
}

export async function analyzeSentiment(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    userId: string
    text?: string | null
    transcriptId?: string | null
    callId?: string | null
    contactId?: string | null
  },
): Promise<{ analysis: PersistedAISentimentAnalysis; reused: boolean }> {
  let sourceType: 'text' | 'transcript' = 'text'
  let content = input.text?.trim() ?? ''
  let transcriptId: string | null = null
  let language = 'en'
  let transcriptUpdatedAt = ''

  if (input.transcriptId) {
    const { data, error } = await supabase
      .from('transcripts')
      .select('id,content,language,updated_at')
      .eq('id', input.transcriptId)
      .eq('organization_id', input.organizationId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('The transcript does not exist or is outside your organization.')
    sourceType = 'transcript'
    transcriptId = data.id as string
    content = String(data.content ?? '').trim()
    language = String(data.language ?? 'en')
    transcriptUpdatedAt = String(data.updated_at ?? '')
  }

  if (content.length < MIN_CONTENT_LENGTH) {
    throw new Error(`Sentiment input must contain at least ${MIN_CONTENT_LENGTH} characters.`)
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`Sentiment input must contain ${MAX_CONTENT_LENGTH.toLocaleString()} characters or fewer.`)
  }

  const sourceHash = createHash('sha256')
    .update(sourceType === 'transcript' ? `${transcriptId}:${transcriptUpdatedAt}:${content}` : content)
    .digest('hex')
  const promptVersion = 1
  const generationKey = createGenerationKey({
    organizationId: input.organizationId,
    sourceType,
    sourceHash,
    promptVersion,
  })

  const { data: existing, error: existingError } = await supabase
    .from('ai_sentiment_analyses')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('generation_key', generationKey)
    .maybeSingle()
  if (existingError) throw new Error(existingError.message)
  if (existing) return { analysis: existing as PersistedAISentimentAnalysis, reused: true }

  const generated = await generatePromptStructured<AISentimentResult>({
    promptKey: 'sentiment.analyze',
    variables: { content, language },
  })
  const result = validate(generated.value)

  const { data, error } = await supabase
    .from('ai_sentiment_analyses')
    .insert({
      organization_id: input.organizationId,
      transcript_id: transcriptId,
      call_id: input.callId ?? null,
      contact_id: input.contactId ?? null,
      source_type: sourceType,
      source_hash: sourceHash,
      label: result.label,
      score: result.score,
      confidence: result.confidence,
      intensity: result.intensity,
      emotions: result.emotions,
      drivers: result.drivers,
      risks: result.risks,
      segments: result.segments,
      rationale: result.rationale,
      provider: generated.metadata.provider,
      model: generated.metadata.model,
      prompt_key: generated.metadata.promptKey,
      prompt_version: generated.metadata.promptVersion,
      provider_request_id: generated.metadata.requestId,
      input_tokens: generated.metadata.inputTokens,
      output_tokens: generated.metadata.outputTokens,
      latency_ms: generated.metadata.latencyMs,
      generation_key: generationKey,
      metadata: { language, sourceCharacterCount: content.length },
      created_by: input.userId,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: duplicate, error: duplicateError } = await supabase
        .from('ai_sentiment_analyses')
        .select('*')
        .eq('organization_id', input.organizationId)
        .eq('generation_key', generationKey)
        .single()
      if (duplicateError) throw new Error(duplicateError.message)
      return { analysis: duplicate as PersistedAISentimentAnalysis, reused: true }
    }
    throw new Error(error.message)
  }

  return { analysis: data as PersistedAISentimentAnalysis, reused: false }
}

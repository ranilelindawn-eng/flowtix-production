import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { generatePromptStructured } from '@/lib/ai/prompts'

import type { AISummarySentiment, AITranscriptSummary, PersistedAISummary } from './types'

const MIN_TRANSCRIPT_LENGTH = 20
const MAX_TRANSCRIPT_LENGTH = 250_000
const MAX_TITLE_LENGTH = 200
const MAX_SUMMARY_LENGTH = 250_000
const MAX_LIST_ITEMS = 50
const MAX_LIST_ITEM_LENGTH = 2_000

const SENTIMENTS: readonly AISummarySentiment[] = ['positive', 'neutral', 'negative', 'mixed']

type TranscriptRow = {
  id: string
  organization_id: string
  content: string
  language: string
  provider: string
  updated_at: string
}

function normalizeText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') throw new Error(`AI summary ${field} is invalid.`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`AI summary ${field} is empty.`)
  if (normalized.length > maximum) throw new Error(`AI summary ${field} is too long.`)
  return normalized
}

function normalizeList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`AI summary ${field} is invalid.`)

  return value
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => normalizeText(item, field, MAX_LIST_ITEM_LENGTH))
}

function validateSummary(value: unknown): AITranscriptSummary {
  if (!value || typeof value !== 'object') throw new Error('The AI provider returned an invalid summary.')
  const candidate = value as Record<string, unknown>
  const sentiment = typeof candidate.sentiment === 'string' ? candidate.sentiment.toLowerCase() : ''

  if (!SENTIMENTS.includes(sentiment as AISummarySentiment)) {
    throw new Error('The AI provider returned an invalid summary sentiment.')
  }

  return {
    title: normalizeText(candidate.title, 'title', MAX_TITLE_LENGTH),
    summary: normalizeText(candidate.summary, 'content', MAX_SUMMARY_LENGTH),
    keyPoints: normalizeList(candidate.keyPoints, 'key points'),
    actionItems: normalizeList(candidate.actionItems, 'action items'),
    sentiment: sentiment as AISummarySentiment,
  }
}

function formatList(items: string[]): string | null {
  return items.length > 0 ? items.map((item) => `• ${item}`).join('\n') : null
}

function generationKey(input: {
  organizationId: string
  transcriptId: string
  transcriptUpdatedAt: string
  promptVersion: number
}): string {
  return createHash('sha256')
    .update(
      [input.organizationId, input.transcriptId, input.transcriptUpdatedAt, input.promptVersion].join(':'),
    )
    .digest('hex')
}

export async function generateTranscriptSummary(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    userId: string
    transcriptId: string
    requestedTitle?: string | null
  },
): Promise<{ summary: PersistedAISummary; reused: boolean }> {
  const { data: transcriptData, error: transcriptError } = await supabase
    .from('transcripts')
    .select('id,organization_id,content,language,provider,updated_at')
    .eq('id', input.transcriptId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (transcriptError) throw new Error(transcriptError.message)
  if (!transcriptData) throw new Error('The transcript does not exist or is outside your organization.')

  const transcript = transcriptData as TranscriptRow
  const content = transcript.content.trim()

  if (content.length < MIN_TRANSCRIPT_LENGTH) {
    throw new Error(`The transcript must contain at least ${MIN_TRANSCRIPT_LENGTH} characters.`)
  }
  if (content.length > MAX_TRANSCRIPT_LENGTH) {
    throw new Error(`The transcript must contain ${MAX_TRANSCRIPT_LENGTH.toLocaleString()} characters or fewer.`)
  }

  const promptVersion = 1
  const key = generationKey({
    organizationId: input.organizationId,
    transcriptId: transcript.id,
    transcriptUpdatedAt: transcript.updated_at,
    promptVersion,
  })

  const { data: existing, error: existingError } = await supabase
    .from('summaries')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('generation_key', key)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (existing) return { summary: existing as PersistedAISummary, reused: true }

  const generated = await generatePromptStructured<AITranscriptSummary>({
    promptKey: 'summary.transcript',
    variables: {
      transcript: content,
      language: transcript.language,
      requestedTitle: input.requestedTitle?.trim() || 'Not provided',
    },
  })
  const value = validateSummary(generated.value)

  const { data, error } = await supabase
    .from('summaries')
    .insert({
      organization_id: input.organizationId,
      transcript_id: transcript.id,
      title: input.requestedTitle?.trim() || value.title,
      summary: value.summary,
      key_points: formatList(value.keyPoints),
      action_items: formatList(value.actionItems),
      sentiment: value.sentiment,
      provider: generated.metadata.provider,
      model: generated.metadata.model,
      prompt_key: generated.metadata.promptKey,
      prompt_version: generated.metadata.promptVersion,
      provider_request_id: generated.metadata.requestId,
      input_tokens: generated.metadata.inputTokens,
      output_tokens: generated.metadata.outputTokens,
      latency_ms: generated.metadata.latencyMs,
      generation_status: 'completed',
      generation_key: key,
      generated_at: new Date().toISOString(),
      metadata: {
        sourceLanguage: transcript.language,
        transcriptProvider: transcript.provider,
        sourceCharacterCount: content.length,
        keyPointCount: value.keyPoints.length,
        actionItemCount: value.actionItems.length,
      },
      created_by: input.userId,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: duplicate, error: duplicateError } = await supabase
        .from('summaries')
        .select('*')
        .eq('organization_id', input.organizationId)
        .eq('generation_key', key)
        .single()
      if (duplicateError) throw new Error(duplicateError.message)
      return { summary: duplicate as PersistedAISummary, reused: true }
    }
    throw new Error(error.message)
  }

  return { summary: data as PersistedAISummary, reused: false }
}

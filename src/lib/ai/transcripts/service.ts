import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { generatePromptStructured } from '@/lib/ai/prompts/service'
import { getAIPromptDefinition } from '@/lib/ai/prompts/registry'

import type {
  TranscriptProcessingResult,
  TranscriptProcessingSegment,
  TranscriptSpeakerRole,
} from './types'

type UnknownRecord = Record<string, unknown>

type TranscriptRow = {
  id: string
  organization_id: string
  language: string
  content: string
  updated_at: string
}

const MIN_CONTENT_LENGTH = 10
const MAX_CONTENT_LENGTH = 100_000
const MAX_SEGMENTS = 500

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.max(minimum, Math.min(maximum, number))
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function cleanStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLength))
}

function normalizeSpeakerRole(value: unknown): TranscriptSpeakerRole {
  return ['agent', 'customer', 'supervisor', 'unknown'].includes(String(value))
    ? (value as TranscriptSpeakerRole)
    : 'unknown'
}

function validateSegments(value: unknown): TranscriptProcessingSegment[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isRecord)
    .slice(0, MAX_SEGMENTS)
    .map((segment, index) => {
      const text = cleanString(segment.text, 10_000)
      if (!text) return null
      const startMs = segment.startMs === null || segment.startMs === undefined
        ? null
        : Math.round(boundedNumber(segment.startMs, 0, 86_400_000, 0))
      const endMs = segment.endMs === null || segment.endMs === undefined
        ? null
        : Math.round(boundedNumber(segment.endMs, startMs ?? 0, 86_400_000, startMs ?? 0))
      const confidence = segment.confidence === null || segment.confidence === undefined
        ? null
        : boundedNumber(segment.confidence, 0, 1, 0)

      return {
        position: index + 1,
        speakerLabel: cleanString(segment.speakerLabel, 100) || `Speaker ${index + 1}`,
        speakerRole: normalizeSpeakerRole(segment.speakerRole),
        text,
        startMs,
        endMs,
        confidence,
      }
    })
    .filter((segment): segment is TranscriptProcessingSegment => segment !== null)
}

function validateResult(value: unknown, fallbackLanguage: string): TranscriptProcessingResult {
  if (!isRecord(value)) throw new Error('The AI provider returned invalid transcript processing data.')

  const normalizedContent = cleanString(value.normalizedContent, MAX_CONTENT_LENGTH)
  if (!normalizedContent) throw new Error('The AI provider returned an empty normalized transcript.')

  const redactedContent = cleanString(value.redactedContent, MAX_CONTENT_LENGTH) || normalizedContent
  const segments = validateSegments(value.segments)
  const uniqueSpeakers = new Set(segments.map((segment) => segment.speakerLabel.toLowerCase()))

  return {
    normalizedContent,
    redactedContent,
    language: cleanString(value.language, 50) || fallbackLanguage,
    speakerCount: Math.max(segments.length > 0 ? uniqueSpeakers.size : 0, Math.round(boundedNumber(value.speakerCount, 0, 100, uniqueSpeakers.size))),
    wordCount: Math.round(boundedNumber(value.wordCount, 0, 1_000_000, normalizedContent.split(/\s+/).filter(Boolean).length)),
    qualityScore: Math.round(boundedNumber(value.qualityScore, 0, 100, 0)),
    confidence: boundedNumber(value.confidence, 0, 1, 0),
    warnings: cleanStringArray(value.warnings, 25, 500),
    segments,
  }
}

function hashSource(transcript: TranscriptRow): string {
  return createHash('sha256')
    .update(`${transcript.id}:${transcript.updated_at}:${transcript.content}`)
    .digest('hex')
}

function generationKey(organizationId: string, transcriptId: string, sourceHash: string, promptVersion: number): string {
  return createHash('sha256')
    .update(`${organizationId}:${transcriptId}:${sourceHash}:${promptVersion}`)
    .digest('hex')
}

export async function processTranscript(
  supabase: SupabaseClient,
  input: { organizationId: string; userId: string; transcriptId: string },
): Promise<{ runId: string; reused: boolean; result: TranscriptProcessingResult }> {
  const { data, error } = await supabase
    .from('transcripts')
    .select('id, organization_id, language, content, updated_at')
    .eq('id', input.transcriptId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('The transcript does not exist or is outside your organization.')

  const transcript = data as TranscriptRow
  const content = transcript.content.trim()
  if (content.length < MIN_CONTENT_LENGTH) throw new Error(`Transcript processing requires at least ${MIN_CONTENT_LENGTH} characters.`)
  if (content.length > MAX_CONTENT_LENGTH) throw new Error(`Transcript processing supports ${MAX_CONTENT_LENGTH.toLocaleString()} characters or fewer.`)

  const prompt = getAIPromptDefinition('transcript.process')
  const sourceHash = hashSource(transcript)
  const key = generationKey(input.organizationId, transcript.id, sourceHash, prompt.version)

  const { data: existing, error: existingError } = await supabase
    .from('ai_transcript_processing_runs')
    .select('id, normalized_content, redacted_content, language, speaker_count, word_count, quality_score, confidence, warnings')
    .eq('organization_id', input.organizationId)
    .eq('generation_key', key)
    .eq('status', 'completed')
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (existing) {
    const { data: segmentRows, error: segmentError } = await supabase
      .from('ai_transcript_segments')
      .select('position, speaker_label, speaker_role, content, start_ms, end_ms, confidence')
      .eq('processing_run_id', existing.id)
      .order('position')
    if (segmentError) throw new Error(segmentError.message)

    return {
      runId: existing.id as string,
      reused: true,
      result: {
        normalizedContent: String(existing.normalized_content ?? ''),
        redactedContent: String(existing.redacted_content ?? ''),
        language: String(existing.language ?? transcript.language),
        speakerCount: Number(existing.speaker_count ?? 0),
        wordCount: Number(existing.word_count ?? 0),
        qualityScore: Number(existing.quality_score ?? 0),
        confidence: Number(existing.confidence ?? 0),
        warnings: Array.isArray(existing.warnings) ? existing.warnings.filter((item): item is string => typeof item === 'string') : [],
        segments: (segmentRows ?? []).map((row) => ({
          position: Number(row.position),
          speakerLabel: String(row.speaker_label),
          speakerRole: normalizeSpeakerRole(row.speaker_role),
          text: String(row.content),
          startMs: row.start_ms === null ? null : Number(row.start_ms),
          endMs: row.end_ms === null ? null : Number(row.end_ms),
          confidence: row.confidence === null ? null : Number(row.confidence),
        })),
      },
    }
  }

  const { data: run, error: runError } = await supabase
    .from('ai_transcript_processing_runs')
    .insert({
      organization_id: input.organizationId,
      transcript_id: transcript.id,
      status: 'processing',
      source_hash: sourceHash,
      generation_key: key,
      language: transcript.language,
      prompt_key: prompt.key,
      prompt_version: prompt.version,
      created_by: input.userId,
      metadata: { sourceCharacterCount: content.length },
    })
    .select('id')
    .single()

  if (runError) {
    if (runError.code === '23505') {
      const { data: concurrent, error: concurrentError } = await supabase
        .from('ai_transcript_processing_runs')
        .select('status')
        .eq('organization_id', input.organizationId)
        .eq('generation_key', key)
        .maybeSingle()
      if (concurrentError) throw new Error(concurrentError.message)
      if (concurrent?.status === 'completed') return processTranscript(supabase, input)
      throw new Error('This transcript revision is already being processed.')
    }
    throw new Error(runError.message)
  }

  const runId = run.id as string
  const { error: processingStateError } = await supabase
    .from('transcripts')
    .update({ processing_status: 'processing', processing_metadata: { runId } })
    .eq('id', transcript.id)
    .eq('organization_id', input.organizationId)
  if (processingStateError) throw new Error(processingStateError.message)

  try {
    const generated = await generatePromptStructured<unknown>({
      promptKey: 'transcript.process',
      variables: { language: transcript.language, transcript: content },
    })
    const result = validateResult(generated.value, transcript.language)

    if (result.segments.length > 0) {
      const { error: segmentInsertError } = await supabase.from('ai_transcript_segments').insert(
        result.segments.map((segment) => ({
          organization_id: input.organizationId,
          transcript_id: transcript.id,
          processing_run_id: runId,
          position: segment.position,
          speaker_label: segment.speakerLabel,
          speaker_role: segment.speakerRole,
          content: segment.text,
          start_ms: segment.startMs,
          end_ms: segment.endMs,
          confidence: segment.confidence,
        })),
      )
      if (segmentInsertError) throw new Error(segmentInsertError.message)
    }

    const completedAt = new Date().toISOString()
    const { error: updateRunError } = await supabase
      .from('ai_transcript_processing_runs')
      .update({
        status: 'completed',
        normalized_content: result.normalizedContent,
        redacted_content: result.redactedContent,
        language: result.language,
        speaker_count: result.speakerCount,
        word_count: result.wordCount,
        quality_score: result.qualityScore,
        confidence: result.confidence,
        warnings: result.warnings,
        provider: generated.metadata.provider,
        model: generated.metadata.model,
        provider_request_id: generated.metadata.requestId,
        input_tokens: generated.metadata.inputTokens,
        output_tokens: generated.metadata.outputTokens,
        latency_ms: generated.metadata.latencyMs,
        completed_at: completedAt,
      })
      .eq('id', runId)
    if (updateRunError) throw new Error(updateRunError.message)

    const { error: transcriptUpdateError } = await supabase
      .from('transcripts')
      .update({
        processing_status: 'completed',
        processing_version: prompt.version,
        normalized_content: result.normalizedContent,
        redacted_content: result.redactedContent,
        detected_language: result.language,
        speaker_count: result.speakerCount,
        word_count: result.wordCount,
        quality_score: result.qualityScore,
        processing_confidence: result.confidence,
        processed_at: completedAt,
        processing_metadata: { runId, warnings: result.warnings },
      })
      .eq('id', transcript.id)
      .eq('organization_id', input.organizationId)
    if (transcriptUpdateError) throw new Error(transcriptUpdateError.message)

    return { runId, reused: false, result }
  } catch (processingError) {
    const message = processingError instanceof Error ? processingError.message : 'Transcript processing failed.'
    await supabase
      .from('ai_transcript_processing_runs')
      .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
      .eq('id', runId)
    await supabase
      .from('transcripts')
      .update({ processing_status: 'failed', processing_metadata: { runId, error: message } })
      .eq('id', transcript.id)
      .eq('organization_id', input.organizationId)
    throw processingError
  }
}

import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { generatePromptStructured } from '@/lib/ai/prompts'

import type {
  AICoachingAction,
  AICoachingCompetency,
  AICoachingCompetencyName,
  AICoachingMoment,
  AICoachingResult,
  PersistedAICoachingAnalysis,
} from './types'

const MIN_TRANSCRIPT_LENGTH = 50
const MAX_TRANSCRIPT_LENGTH = 250_000
const COMPETENCIES: readonly AICoachingCompetencyName[] = [
  'discovery',
  'communication',
  'objection_handling',
  'product_knowledge',
  'rapport',
  'next_steps',
  'compliance',
]

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`AI coaching ${field} is invalid.`)
  }
  return value.trim().slice(0, maximum)
}

function stringList(value: unknown, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, maximumItems)
    .map((item) => item.trim().slice(0, maximumLength))
}

function score(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`AI coaching ${field} is invalid.`)
  }
  return Math.round(Math.max(0, Math.min(100, value)))
}

function confidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('AI coaching confidence is invalid.')
  }
  return Math.max(0, Math.min(1, value))
}

function competencies(value: unknown): AICoachingCompetency[] {
  if (!Array.isArray(value)) return []
  return value
    .map(record)
    .filter((item): item is Record<string, unknown> => item !== null)
    .slice(0, COMPETENCIES.length)
    .map((item) => {
      const name = typeof item.name === 'string' ? item.name.toLowerCase() : ''
      if (!COMPETENCIES.includes(name as AICoachingCompetencyName)) {
        throw new Error('AI coaching competency name is invalid.')
      }
      return {
        name: name as AICoachingCompetencyName,
        score: score(item.score, 'competency score'),
        evidence: stringList(item.evidence, 8, 1_000),
        feedback: requiredText(item.feedback, 'competency feedback', 2_000),
      }
    })
}

function moments(value: unknown): AICoachingMoment[] {
  if (!Array.isArray(value)) return []
  return value
    .map(record)
    .filter((item): item is Record<string, unknown> => item !== null)
    .slice(0, 20)
    .map((item) => {
      const type = typeof item.type === 'string' ? item.type.toLowerCase() : ''
      if (!['positive', 'improvement', 'risk'].includes(type)) {
        throw new Error('AI coaching moment type is invalid.')
      }
      return {
        type: type as AICoachingMoment['type'],
        excerpt: requiredText(item.excerpt, 'moment excerpt', 1_500),
        explanation: requiredText(item.explanation, 'moment explanation', 2_000),
        recommendation: requiredText(item.recommendation, 'moment recommendation', 2_000),
      }
    })
}

function actionPlan(value: unknown): AICoachingAction[] {
  if (!Array.isArray(value)) return []
  return value
    .map(record)
    .filter((item): item is Record<string, unknown> => item !== null)
    .slice(0, 12)
    .map((item) => {
      const priority = typeof item.priority === 'string' ? item.priority.toLowerCase() : ''
      if (!['low', 'medium', 'high'].includes(priority)) {
        throw new Error('AI coaching action priority is invalid.')
      }
      return {
        title: requiredText(item.title, 'action title', 200),
        description: requiredText(item.description, 'action description', 2_000),
        priority: priority as AICoachingAction['priority'],
      }
    })
}

function validate(value: unknown): AICoachingResult {
  const candidate = record(value)
  if (!candidate) throw new Error('The AI provider returned invalid coaching output.')
  return {
    overallScore: score(candidate.overallScore, 'overall score'),
    confidence: confidence(candidate.confidence),
    managerSummary: requiredText(candidate.managerSummary, 'manager summary', 5_000),
    strengths: stringList(candidate.strengths, 20, 1_000),
    improvements: stringList(candidate.improvements, 20, 1_000),
    competencies: competencies(candidate.competencies),
    moments: moments(candidate.moments),
    actionPlan: actionPlan(candidate.actionPlan),
    complianceFlags: stringList(candidate.complianceFlags, 20, 1_000),
  }
}

function generationKey(input: {
  organizationId: string
  transcriptId: string
  sourceHash: string
  focus: string
  promptVersion: number
}): string {
  return createHash('sha256')
    .update(
      [input.organizationId, input.transcriptId, input.sourceHash, input.focus, input.promptVersion].join(':'),
    )
    .digest('hex')
}

export async function generateCallCoaching(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    userId: string
    usageIdempotencyKey: string
    transcriptId: string
    focus?: string | null
    agentUserId?: string | null
  },
): Promise<{ coaching: PersistedAICoachingAnalysis; reused: boolean }> {
  const { data: transcript, error: transcriptError } = await supabase
    .from('transcripts')
    .select('id,content,language,updated_at,recording_id,recording:recordings(call_id)')
    .eq('id', input.transcriptId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()
  if (transcriptError) throw new Error(transcriptError.message)
  if (!transcript) throw new Error('The transcript does not exist or is outside your organization.')

  const content = String(transcript.content ?? '').trim()
  if (content.length < MIN_TRANSCRIPT_LENGTH) {
    throw new Error(`Coaching requires at least ${MIN_TRANSCRIPT_LENGTH} transcript characters.`)
  }
  if (content.length > MAX_TRANSCRIPT_LENGTH) {
    throw new Error(`Coaching supports ${MAX_TRANSCRIPT_LENGTH.toLocaleString()} transcript characters or fewer.`)
  }

  const recordingValue = transcript.recording as { call_id?: string | null } | { call_id?: string | null }[] | null
  const callId = Array.isArray(recordingValue)
    ? recordingValue[0]?.call_id ?? null
    : recordingValue?.call_id ?? null

  let agentUserId = input.agentUserId ?? null
  let agentName = 'Assigned agent'
  if (callId) {
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('owner_user_id')
      .eq('id', callId)
      .eq('organization_id', input.organizationId)
      .maybeSingle()
    if (callError) throw new Error(callError.message)
    if (!agentUserId) agentUserId = (call?.owner_user_id as string | null | undefined) ?? null
  }

  if (agentUserId) {
    const { data: member, error: memberError } = await supabase
      .from('organization_members')
      .select('user_id,profile:profiles(full_name)')
      .eq('organization_id', input.organizationId)
      .eq('user_id', agentUserId)
      .eq('status', 'active')
      .maybeSingle()
    if (memberError) throw new Error(memberError.message)
    if (!member) throw new Error('The selected coaching agent is not an active organization member.')
    const profileValue = member.profile as { full_name?: string | null } | { full_name?: string | null }[] | null
    const fullName = Array.isArray(profileValue) ? profileValue[0]?.full_name : profileValue?.full_name
    if (typeof fullName === 'string' && fullName.trim()) agentName = fullName.trim()
  }

  const focus = (input.focus?.trim() || 'Balanced review across all coaching competencies').slice(0, 500)
  const sourceHash = createHash('sha256')
    .update(`${transcript.id}:${transcript.updated_at ?? ''}:${content}`)
    .digest('hex')
  const promptVersion = 1
  const key = generationKey({
    organizationId: input.organizationId,
    transcriptId: transcript.id as string,
    sourceHash,
    focus,
    promptVersion,
  })

  const { data: existing, error: existingError } = await supabase
    .from('ai_coaching_analyses')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('generation_key', key)
    .maybeSingle()
  if (existingError) throw new Error(existingError.message)
  if (existing) return { coaching: existing as PersistedAICoachingAnalysis, reused: true }

  const generated = await generatePromptStructured<AICoachingResult>({
    promptKey: 'coaching.call',
    usage: {
      supabase,
      organizationId: input.organizationId,
      feature: 'coaching',
      idempotencyKey: input.usageIdempotencyKey,
    },
    variables: {
      language: String(transcript.language ?? 'en'),
      agentName,
      focus,
      transcript: content,
    },
  })
  const result = validate(generated.value)

  const payload = {
    organization_id: input.organizationId,
    transcript_id: transcript.id,
    call_id: callId,
    agent_user_id: agentUserId,
    focus,
    source_hash: sourceHash,
    overall_score: result.overallScore,
    confidence: result.confidence,
    manager_summary: result.managerSummary,
    strengths: result.strengths,
    improvements: result.improvements,
    competencies: result.competencies,
    moments: result.moments,
    action_plan: result.actionPlan,
    compliance_flags: result.complianceFlags,
    provider: generated.metadata.provider,
    model: generated.metadata.model,
    prompt_key: generated.metadata.promptKey,
    prompt_version: generated.metadata.promptVersion,
    provider_request_id: generated.metadata.requestId,
    input_tokens: generated.metadata.inputTokens,
    output_tokens: generated.metadata.outputTokens,
    latency_ms: generated.metadata.latencyMs,
    generation_key: key,
    metadata: { language: transcript.language ?? 'en', sourceCharacterCount: content.length, agentName },
    created_by: input.userId,
  }

  const { data, error } = await supabase
    .from('ai_coaching_analyses')
    .insert(payload)
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') {
      const { data: duplicate, error: duplicateError } = await supabase
        .from('ai_coaching_analyses')
        .select('*')
        .eq('organization_id', input.organizationId)
        .eq('generation_key', key)
        .single()
      if (duplicateError) throw new Error(duplicateError.message)
      return { coaching: duplicate as PersistedAICoachingAnalysis, reused: true }
    }
    throw new Error(error.message)
  }

  return { coaching: data as PersistedAICoachingAnalysis, reused: false }
}

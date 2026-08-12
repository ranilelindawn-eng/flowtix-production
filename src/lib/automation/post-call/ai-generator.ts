import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { generatePromptStructured } from '@/lib/ai/prompts'
import { isAIUsageControlError } from '@/lib/ai/usage/service'
import { assertPostCallAIEntitlement } from '@/lib/automation/post-call/entitlement'
import type { RenderedPostCallTemplates } from '@/lib/automation/post-call/template-renderer'
import { NonRetryableJobError } from '@/lib/jobs/types'

type AITone = 'professional' | 'friendly' | 'concise' | 'persuasive'

type ExistingGeneration = {
  id: string
  email_subject: string | null
  email_body: string | null
  sms_body: string | null
  provider: string
  model: string | null
}

type GeneratedValue = {
  emailSubject: unknown
  emailBody: unknown
  smsBody: unknown
}

export type GeneratedPostCallFollowUp = {
  generationId: string
  emailSubject: string | null
  emailBody: string | null
  smsBody: string | null
  provider: string
  model: string | null
  reused: boolean
}

const ALLOWED_TONES: readonly AITone[] = [
  'professional',
  'friendly',
  'concise',
  'persuasive',
]

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service-role configuration for post-call AI generation.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function optionalGeneratedText(
  value: unknown,
  label: string,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    throw new Error(`AI-generated ${label} is invalid.`)
  }

  const normalized = value.trim()
  if (!normalized) return null

  return normalized.slice(0, maxLength)
}

function mapExisting(
  row: ExistingGeneration,
): GeneratedPostCallFollowUp {
  return {
    generationId: row.id,
    emailSubject: row.email_subject,
    emailBody: row.email_body,
    smsBody: row.sms_body,
    provider: row.provider,
    model: row.model,
    reused: true,
  }
}

function safeContext(value: string | null | undefined, max: number) {
  return value?.trim().slice(0, max) || 'Not available.'
}

export async function generatePostCallFollowUp(input: {
  dispatchJobId: string
  organizationId: string
  callId: string
  rendered: RenderedPostCallTemplates
}): Promise<GeneratedPostCallFollowUp | null> {
  const client = createServiceClient()

  const { data: config, error: configError } = await client
    .from('post_call_automation_configs')
    .select('ai_enabled,ai_tone,ai_instructions')
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (configError) {
    throw new Error(
      `Unable to load post-call AI configuration: ${configError.message}`,
    )
  }

  if (!config || config.ai_enabled !== true) {
    return null
  }

  await assertPostCallAIEntitlement(input.organizationId)

  const { data: existing, error: existingError } = await client
    .from('post_call_ai_generations')
    .select('id,email_subject,email_body,sms_body,provider,model')
    .eq('organization_id', input.organizationId)
    .eq('dispatch_job_id', input.dispatchJobId)
    .maybeSingle()

  if (existingError) {
    throw new Error(
      `Unable to load existing post-call AI generation: ${existingError.message}`,
    )
  }

  if (existing) {
    return mapExisting(existing as ExistingGeneration)
  }

  const [summaryResult, transcriptResult] = await Promise.all([
    client
      .from('call_ai_insights')
      .select('summary')
      .eq('organization_id', input.organizationId)
      .eq('call_id', input.callId)
      .maybeSingle(),
    client
      .from('call_transcripts')
      .select('content,status')
      .eq('organization_id', input.organizationId)
      .eq('call_id', input.callId)
      .maybeSingle(),
  ])

  if (summaryResult.error) {
    throw new Error(
      `Unable to load call summary for AI follow-up: ${summaryResult.error.message}`,
    )
  }

  if (transcriptResult.error) {
    throw new Error(
      `Unable to load call transcript for AI follow-up: ${transcriptResult.error.message}`,
    )
  }

  const requestedTone =
    typeof config.ai_tone === 'string'
      ? config.ai_tone.trim().toLowerCase()
      : ''
  const tone: AITone = ALLOWED_TONES.includes(
    requestedTone as AITone,
  )
    ? (requestedTone as AITone)
    : 'professional'

  const contactName = [
    input.rendered.context.contact.firstName,
    input.rendered.context.contact.lastName,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()

  const generated = await generatePromptStructured<GeneratedValue>({
    promptKey: 'post_call.follow_up',
    usage: {
      supabase: client,
      organizationId: input.organizationId,
      feature: 'post_call_follow_up',
      idempotencyKey: `post-call-ai:${input.dispatchJobId}`,
      metadata: {
        source: 'post_call_automation',
        callId: input.callId,
        dispatchJobId: input.dispatchJobId,
      },
    },
    variables: {
      organizationName:
        input.rendered.context.organization.name || 'Organization',
      contactName: contactName || 'Customer',
      agentName: input.rendered.context.agent.name || 'Team member',
      callStatus: input.rendered.context.call.status,
      callDuration:
        input.rendered.context.call.duration || 'Not available',
      emailEnabled: input.rendered.emailEnabled,
      smsEnabled: input.rendered.smsEnabled,
      tone,
      instructions: safeContext(config.ai_instructions, 2_000),
      emailSubject: safeContext(input.rendered.emailSubject, 1_000),
      emailBody: safeContext(input.rendered.emailBody, 10_000),
      smsBody: safeContext(input.rendered.smsBody, 1_600),
      callSummary: safeContext(
        typeof summaryResult.data?.summary === 'string'
          ? summaryResult.data.summary
          : null,
        8_000,
      ),
      transcript: safeContext(
        transcriptResult.data?.status === 'completed' &&
          typeof transcriptResult.data.content === 'string'
          ? transcriptResult.data.content
          : null,
        24_000,
      ),
    },
  })

  const emailSubject = input.rendered.emailEnabled
    ? optionalGeneratedText(
        generated.value.emailSubject,
        'email subject',
        250,
      )
    : null
  const emailBody = input.rendered.emailEnabled
    ? optionalGeneratedText(
        generated.value.emailBody,
        'email body',
        20_000,
      )
    : null
  const smsBody = input.rendered.smsEnabled
    ? optionalGeneratedText(
        generated.value.smsBody,
        'SMS body',
        480,
      )
    : null

  if (
    input.rendered.emailEnabled &&
    (!emailSubject || !emailBody)
  ) {
    throw new NonRetryableJobError(
      'AI follow-up did not return a complete email.',
      'POST_CALL_AI_EMAIL_INCOMPLETE',
    )
  }

  if (input.rendered.smsEnabled && !smsBody) {
    throw new NonRetryableJobError(
      'AI follow-up did not return an SMS message.',
      'POST_CALL_AI_SMS_INCOMPLETE',
    )
  }

  const row = {
    organization_id: input.organizationId,
    dispatch_job_id: input.dispatchJobId,
    call_id: input.callId,
    contact_id: input.rendered.contactId,
    email_subject: emailSubject,
    email_body: emailBody,
    sms_body: smsBody,
    provider: generated.metadata.provider,
    model: generated.metadata.model,
    provider_request_id: generated.metadata.requestId,
    input_tokens: generated.metadata.inputTokens,
    output_tokens: generated.metadata.outputTokens,
    latency_ms: generated.metadata.latencyMs,
    prompt_key: generated.metadata.promptKey,
    prompt_version: generated.metadata.promptVersion,
    metadata: {
      tone,
      source: 'post_call_automation',
    },
  }

  const { data: inserted, error: insertError } = await client
    .from('post_call_ai_generations')
    .insert(row)
    .select('id,email_subject,email_body,sms_body,provider,model')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: concurrent, error: concurrentError } = await client
        .from('post_call_ai_generations')
        .select('id,email_subject,email_body,sms_body,provider,model')
        .eq('organization_id', input.organizationId)
        .eq('dispatch_job_id', input.dispatchJobId)
        .single()

      if (concurrentError) {
        throw new Error(concurrentError.message)
      }

      return mapExisting(concurrent as ExistingGeneration)
    }

    throw new Error(
      `Unable to persist post-call AI generation: ${insertError.message}`,
    )
  }

  return {
    ...mapExisting(inserted as ExistingGeneration),
    reused: false,
  }
}

export function postCallAIFallbackReason(error: unknown): string {
  if (isAIUsageControlError(error)) {
    return 'AI_USAGE_UNAVAILABLE'
  }

  if (
    error instanceof NonRetryableJobError &&
    error.code === 'POST_CALL_AI_ENTITLEMENT_REQUIRED'
  ) {
    return 'AI_ENTITLEMENT_UNAVAILABLE'
  }

  return 'AI_GENERATION_FAILED'
}

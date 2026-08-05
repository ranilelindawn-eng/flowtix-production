import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { generatePromptStructured } from '@/lib/ai/prompts'

import type { AIEmailTone, GeneratedAIEmail, PersistedAIEmail } from './types'

const MAX_RECIPIENT_LENGTH = 250
const MAX_EMAIL_LENGTH = 320
const MAX_PURPOSE_LENGTH = 1_000
const MAX_CONTEXT_LENGTH = 30_000
const MAX_TITLE_LENGTH = 250
const MAX_BODY_LENGTH = 20_000
const MAX_LIST_ITEMS = 12
const TONES: readonly AIEmailTone[] = ['professional', 'friendly', 'concise', 'persuasive']

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`AI email ${field} is invalid.`)
  return value.trim().slice(0, maxLength)
}

function optionalText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null
}

function stringList(value: unknown, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => item.trim().slice(0, maxLength))
}

function validateGeneratedEmail(value: unknown): GeneratedAIEmail {
  const root = record(value)
  if (!root) throw new Error('The AI provider returned an invalid email.')
  return {
    subject: text(root.subject, 'subject', MAX_TITLE_LENGTH),
    body: text(root.body, 'body', MAX_BODY_LENGTH),
    callToAction: optionalText(root.callToAction, 1_000),
    personalizationFacts: stringList(root.personalizationFacts, 500),
    complianceWarnings: stringList(root.complianceWarnings, 500),
  }
}

function normalizedHash(value: string): string {
  return createHash('sha256').update(value.trim().replace(/\s+/g, ' ')).digest('hex')
}

function generationKey(input: {
  organizationId: string
  sourceHash: string
  contactId: string | null
  callId: string | null
  transcriptId: string | null
  tone: AIEmailTone
  promptVersion: number
}): string {
  return createHash('sha256')
    .update([
      input.organizationId,
      input.sourceHash,
      input.contactId ?? '',
      input.callId ?? '',
      input.transcriptId ?? '',
      input.tone,
      input.promptVersion,
    ].join(':'))
    .digest('hex')
}

async function assertReference(
  supabase: SupabaseClient,
  table: 'contacts' | 'calls' | 'transcripts',
  id: string | null,
  organizationId: string,
): Promise<void> {
  if (!id) return
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`The selected ${table.slice(0, -1)} is outside your organization or does not exist.`)
}

export async function generateAIEmail(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    userId: string
    recipient?: string | null
    recipientEmail?: string | null
    purpose: string
    context?: string | null
    tone?: string | null
    contactId?: string | null
    callId?: string | null
    transcriptId?: string | null
  },
): Promise<{ email: PersistedAIEmail; reused: boolean }> {
  const recipient = input.recipient?.trim().slice(0, MAX_RECIPIENT_LENGTH) || null
  const recipientEmail = input.recipientEmail?.trim().slice(0, MAX_EMAIL_LENGTH) || null
  const purpose = input.purpose.trim()
  const context = input.context?.trim() || ''
  const requestedTone = input.tone?.trim().toLowerCase() ?? ''
  const tone: AIEmailTone = TONES.includes(requestedTone as AIEmailTone)
    ? (requestedTone as AIEmailTone)
    : 'professional'
  const contactId = input.contactId ?? null
  const callId = input.callId ?? null
  const transcriptId = input.transcriptId ?? null

  if (!purpose) throw new Error('Email purpose is required.')
  if (purpose.length > MAX_PURPOSE_LENGTH) throw new Error(`Purpose must be ${MAX_PURPOSE_LENGTH.toLocaleString()} characters or fewer.`)
  if (context.length > MAX_CONTEXT_LENGTH) throw new Error(`Context must be ${MAX_CONTEXT_LENGTH.toLocaleString()} characters or fewer.`)

  await Promise.all([
    assertReference(supabase, 'contacts', contactId, input.organizationId),
    assertReference(supabase, 'calls', callId, input.organizationId),
    assertReference(supabase, 'transcripts', transcriptId, input.organizationId),
  ])

  const promptVersion = 2
  const sourceHash = normalizedHash(JSON.stringify({ recipient, recipientEmail, purpose, context }))
  const key = generationKey({
    organizationId: input.organizationId,
    sourceHash,
    contactId,
    callId,
    transcriptId,
    tone,
    promptVersion,
  })

  const { data: existing, error: existingError } = await supabase
    .from('ai_generated_emails')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('generation_key', key)
    .maybeSingle()
  if (existingError) throw new Error(existingError.message)
  if (existing) return { email: existing as PersistedAIEmail, reused: true }

  const generated = await generatePromptStructured<GeneratedAIEmail>({
    promptKey: 'email.generate',
    variables: {
      recipient: recipient || 'Customer',
      recipientEmail: recipientEmail || 'Not provided',
      purpose,
      tone,
      context: context || 'No additional context was supplied.',
    },
  })
  const email = validateGeneratedEmail(generated.value)

  const row = {
    organization_id: input.organizationId,
    contact_id: contactId,
    call_id: callId,
    transcript_id: transcriptId,
    recipient_name: recipient,
    recipient_email: recipientEmail,
    purpose,
    tone,
    context: context || null,
    subject: email.subject,
    body: email.body,
    call_to_action: email.callToAction,
    personalization_facts: email.personalizationFacts,
    compliance_warnings: email.complianceWarnings,
    status: 'generated',
    source_hash: sourceHash,
    generation_key: key,
    provider: generated.metadata.provider,
    model: generated.metadata.model,
    prompt_key: generated.metadata.promptKey,
    prompt_version: generated.metadata.promptVersion,
    provider_request_id: generated.metadata.requestId,
    input_tokens: generated.metadata.inputTokens,
    output_tokens: generated.metadata.outputTokens,
    latency_ms: generated.metadata.latencyMs,
    metadata: { source: 'ai_email_generation' },
    created_by: input.userId,
  }

  const { data, error } = await supabase.from('ai_generated_emails').insert(row).select('*').single()
  if (error) {
    if (error.code === '23505') {
      const { data: concurrent, error: concurrentError } = await supabase
        .from('ai_generated_emails')
        .select('*')
        .eq('organization_id', input.organizationId)
        .eq('generation_key', key)
        .single()
      if (concurrentError) throw new Error(concurrentError.message)
      return { email: concurrent as PersistedAIEmail, reused: true }
    }
    throw new Error(error.message)
  }

  return { email: data as PersistedAIEmail, reused: false }
}

export async function updateAIEmailStatus(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    emailId: string
    userId: string
    action: 'approve' | 'dismiss'
  },
): Promise<PersistedAIEmail> {
  const now = new Date().toISOString()
  const changes = input.action === 'approve'
    ? { status: 'approved', approved_at: now, approved_by: input.userId, dismissed_at: null, dismissed_by: null }
    : { status: 'dismissed', dismissed_at: now, dismissed_by: input.userId, approved_at: null, approved_by: null }

  const { data, error } = await supabase
    .from('ai_generated_emails')
    .update(changes)
    .eq('id', input.emailId)
    .eq('organization_id', input.organizationId)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('The AI-generated email was not found.')
  return data as PersistedAIEmail
}

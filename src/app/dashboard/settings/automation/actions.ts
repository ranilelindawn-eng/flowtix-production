'use server'

import { revalidatePath } from 'next/cache'

import { requirePermission } from '@/lib/auth'
import { writeAuditEvent } from '@/lib/security/audit'
import { createClient } from '@/lib/supabase/server'

function checked(formData: FormData, name: string) {
  return formData.get(name) === 'on'
}

function textValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').trim()
}

function parseDelaySeconds(formData: FormData) {
  const raw = textValue(formData, 'delaySeconds')
  const parsed = Number(raw)

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 604800) {
    throw new Error(
      'Post-call delay must be a whole number between 0 and 604800 seconds.',
    )
  }

  return parsed
}

function parseTriggerStatuses(formData: FormData) {
  const supported = ['completed', 'failed', 'cancelled'] as const
  const selected = supported.filter((status) =>
    formData.getAll('triggerStatuses').includes(status),
  )

  if (selected.length === 0) {
    throw new Error('Select at least one post-call trigger status.')
  }

  return selected
}

export async function updatePostCallAutomation(
  formData: FormData,
): Promise<void> {
  const organization = await requirePermission(
    'automation.post_call.manage',
  )
  const supabase = await createClient()

  const enabled = checked(formData, 'enabled')
  const emailEnabled = checked(formData, 'emailEnabled')
  const smsEnabled = checked(formData, 'smsEnabled')
  const emailSubject = textValue(formData, 'emailSubject')
  const emailBody = textValue(formData, 'emailBody')
  const smsBody = textValue(formData, 'smsBody')
  const aiEnabled = checked(formData, 'aiEnabled')
  const aiTone = textValue(formData, 'aiTone').toLowerCase()
  const aiInstructions = textValue(formData, 'aiInstructions')

  if (enabled && !emailEnabled && !smsEnabled) {
    throw new Error(
      'Enable at least one channel before enabling post-call automation.',
    )
  }

  if (emailEnabled && (!emailSubject || !emailBody)) {
    throw new Error(
      'Email subject and message are required when email follow-up is enabled.',
    )
  }

  if (smsEnabled && !smsBody) {
    throw new Error(
      'SMS message is required when SMS follow-up is enabled.',
    )
  }

  const supportedAITones = [
    'professional',
    'friendly',
    'concise',
    'persuasive',
  ] as const

  if (
    aiEnabled &&
    !supportedAITones.includes(
      aiTone as (typeof supportedAITones)[number],
    )
  ) {
    throw new Error('Select a supported AI follow-up tone.')
  }

  if (aiInstructions.length > 2_000) {
    throw new Error(
      'AI follow-up instructions must be 2,000 characters or fewer.',
    )
  }

  const nextValues = {
    enabled,
    email_enabled: emailEnabled,
    sms_enabled: smsEnabled,
    trigger_statuses: parseTriggerStatuses(formData),
    delay_seconds: parseDelaySeconds(formData),
    email_subject: emailSubject || null,
    email_body: emailBody || null,
    sms_body: smsBody || null,
    ai_enabled: aiEnabled,
    ai_tone: aiEnabled ? aiTone : 'professional',
    ai_instructions: aiInstructions || null,
    email_sender_mode: 'connected_integration',
    sms_sender_mode: 'default_organization_number',
    updated_by: organization.user_id,
  }

  const { data: previous, error: previousError } = await supabase
    .from('post_call_automation_configs')
    .select(
      'enabled,email_enabled,sms_enabled,trigger_statuses,delay_seconds,email_subject,email_body,sms_body,ai_enabled,ai_tone,ai_instructions,email_sender_mode,sms_sender_mode',
    )
    .eq('organization_id', organization.organization_id)
    .maybeSingle()

  if (previousError) {
    throw new Error(
      `Unable to load post-call automation configuration: ${previousError.message}`,
    )
  }

  const { error } = await supabase
    .from('post_call_automation_configs')
    .upsert(
      {
        organization_id: organization.organization_id,
        ...nextValues,
      },
      { onConflict: 'organization_id' },
    )

  if (error) {
    throw new Error(
      `Unable to update post-call automation: ${error.message}`,
    )
  }

  await writeAuditEvent({
    action: 'automation.post_call.updated',
    resourceType: 'post_call_automation_config',
    resourceId: organization.organization_id,
    outcome: 'success',
    source: 'application',
    oldValues: previous ?? {},
    newValues: nextValues,
  })

  revalidatePath('/dashboard/settings/automation')
}

export async function updateAutomationControls(
  formData: FormData,
): Promise<void> {
  const organization = await requirePermission('automation.manage')
  const supabase = await createClient()
  const pauseReason = String(
    formData.get('pauseReason') ?? '',
  ).trim()

  const nextValues = {
    global_paused: checked(formData, 'globalPaused'),
    communications_paused: checked(
      formData,
      'communicationsPaused',
    ),
    sequences_paused: checked(formData, 'sequencesPaused'),
    campaigns_paused: checked(formData, 'campaignsPaused'),
    pause_reason: pauseReason || null,
    updated_by: organization.user_id,
    updated_at: new Date().toISOString(),
  }

  const { data: previous } = await supabase
    .from('automation_controls')
    .select(
      'global_paused,communications_paused,sequences_paused,campaigns_paused,pause_reason',
    )
    .eq('organization_id', organization.organization_id)
    .maybeSingle()

  const { error } = await supabase
    .from('automation_controls')
    .upsert(
      {
        organization_id: organization.organization_id,
        ...nextValues,
      },
      { onConflict: 'organization_id' },
    )

  if (error) {
    throw new Error(
      `Unable to update automation controls: ${error.message}`,
    )
  }

  await writeAuditEvent({
    action: 'automation.controls.updated',
    resourceType: 'automation_control',
    resourceId: organization.organization_id,
    outcome: 'success',
    source: 'application',
    oldValues: previous ?? {},
    newValues: nextValues,
  })

  revalidatePath('/dashboard/settings/automation')
  revalidatePath('/dashboard/settings/jobs')
}

export async function retryAllFailedAutomationJobs(): Promise<void> {
  const organization = await requirePermission('automation.manage')
  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'retry_failed_automation_jobs',
    {
      p_organization_id: organization.organization_id,
      p_limit: 100,
    },
  )

  if (error) {
    throw new Error(
      `Unable to retry failed automation jobs: ${error.message}`,
    )
  }

  await writeAuditEvent({
    action: 'automation.failed_jobs.retried',
    resourceType: 'background_job',
    resourceId: organization.organization_id,
    outcome: 'success',
    source: 'application',
    metadata: {
      retried: Number(data ?? 0),
    },
  })

  revalidatePath('/dashboard/settings/automation')
  revalidatePath('/dashboard/settings/jobs')
}

export async function releaseExpiredCampaignReservations(): Promise<void> {
  const organization = await requirePermission('automation.manage')
  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'recover_expired_campaign_reservations',
    { p_limit: 500 },
  )

  if (error) {
    throw new Error(
      `Unable to recover campaign reservations: ${error.message}`,
    )
  }

  await writeAuditEvent({
    action: 'automation.campaign_reservations.recovered',
    resourceType: 'campaign_member',
    resourceId: organization.organization_id,
    outcome: 'success',
    source: 'application',
    metadata:
      data && typeof data === 'object'
        ? (data as Record<string, string | number | boolean | null>)
        : {},
  })

  revalidatePath('/dashboard/settings/automation')
}

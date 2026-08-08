import 'server-only'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import type { TelephonyCallStatus } from '@/lib/telephony/provider'

const terminalStatuses = new Set<TelephonyCallStatus>([
  'completed',
  'failed',
  'cancelled',
])

type TriggerReason =
  | 'eligible'
  | 'non_terminal_status'
  | 'already_terminal'
  | 'configuration_missing'
  | 'automation_disabled'
  | 'status_not_enabled'

export type PostCallTriggerEvaluation = {
  eligible: boolean
  reason: TriggerReason
  organizationId: string
  callId: string
  previousStatus: string
  status: TelephonyCallStatus
  occurredAt: string
  emailEnabled: boolean
  smsEnabled: boolean
  delaySeconds: number
}

export type PostCallDispatchJob = {
  id: string
  organization_id: string
  queue: string
  job_type: string
  status: string
  scheduled_at: string
  idempotency_key: string | null
}

export async function evaluateCanonicalPostCallTrigger(input: {
  organizationId: string
  callId: string
  previousStatus: string
  status: TelephonyCallStatus
  occurredAt: string
}): Promise<PostCallTriggerEvaluation> {
  const base = {
    organizationId: input.organizationId,
    callId: input.callId,
    previousStatus: input.previousStatus,
    status: input.status,
    occurredAt: input.occurredAt,
    emailEnabled: false,
    smsEnabled: false,
    delaySeconds: 0,
  }

  if (!terminalStatuses.has(input.status)) {
    return {
      ...base,
      eligible: false,
      reason: 'non_terminal_status',
    }
  }

  if (
    terminalStatuses.has(
      input.previousStatus as TelephonyCallStatus,
    )
  ) {
    return {
      ...base,
      eligible: false,
      reason: 'already_terminal',
    }
  }

  const admin = createTelephonyAdminClient()
  const { data: config, error } = await admin
    .from('post_call_automation_configs')
    .select(
      'enabled,email_enabled,sms_enabled,trigger_statuses,delay_seconds',
    )
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Unable to evaluate post-call automation configuration: ${error.message}`,
    )
  }

  if (!config) {
    return {
      ...base,
      eligible: false,
      reason: 'configuration_missing',
    }
  }

  const emailEnabled = config.email_enabled === true
  const smsEnabled = config.sms_enabled === true
  const delaySeconds =
    typeof config.delay_seconds === 'number'
      ? config.delay_seconds
      : 0

  const configuredStatuses = Array.isArray(config.trigger_statuses)
    ? config.trigger_statuses.filter(
        (value): value is string => typeof value === 'string',
      )
    : []

  if (config.enabled !== true) {
    return {
      ...base,
      emailEnabled,
      smsEnabled,
      delaySeconds,
      eligible: false,
      reason: 'automation_disabled',
    }
  }

  if (!configuredStatuses.includes(input.status)) {
    return {
      ...base,
      emailEnabled,
      smsEnabled,
      delaySeconds,
      eligible: false,
      reason: 'status_not_enabled',
    }
  }

  return {
    ...base,
    emailEnabled,
    smsEnabled,
    delaySeconds,
    eligible: true,
    reason: 'eligible',
  }
}


function parseDispatchJob(value: unknown): PostCallDispatchJob {
  if (!value || typeof value !== 'object') {
    throw new Error(
      'The post-call automation queue returned an invalid job record.',
    )
  }

  const candidate = value as Partial<PostCallDispatchJob>

  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.organization_id !== 'string' ||
    typeof candidate.queue !== 'string' ||
    typeof candidate.job_type !== 'string' ||
    typeof candidate.status !== 'string' ||
    typeof candidate.scheduled_at !== 'string'
  ) {
    throw new Error(
      'The post-call automation queue returned an incomplete job record.',
    )
  }

  return candidate as PostCallDispatchJob
}

export async function enqueueCanonicalPostCallDispatch(
  evaluation: PostCallTriggerEvaluation,
): Promise<PostCallDispatchJob | null> {
  if (!evaluation.eligible) {
    return null
  }

  const admin = createTelephonyAdminClient()
  const { data, error } = await admin.rpc(
    'enqueue_post_call_automation_job',
    {
      p_organization_id: evaluation.organizationId,
      p_call_id: evaluation.callId,
      p_call_status: evaluation.status,
      p_occurred_at: evaluation.occurredAt,
      p_delay_seconds: evaluation.delaySeconds,
      p_email_enabled: evaluation.emailEnabled,
      p_sms_enabled: evaluation.smsEnabled,
    },
  )

  if (error) {
    throw new Error(
      `Unable to enqueue post-call automation job: ${error.message}`,
    )
  }

  return parseDispatchJob(data)
}

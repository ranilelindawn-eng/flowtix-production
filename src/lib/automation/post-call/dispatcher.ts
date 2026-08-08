import 'server-only'

import { createClient } from '@supabase/supabase-js'

import {
  generatePostCallFollowUp,
  postCallAIFallbackReason,
} from '@/lib/automation/post-call/ai-generator'
import { assertPostCallAutomationEntitlement } from '@/lib/automation/post-call/entitlement'
import { renderPostCallTemplates } from '@/lib/automation/post-call/template-renderer'
import { writeSystemAuditEvent } from '@/lib/security/system-audit'
import {
  NonRetryableJobError,
  type JsonValue,
} from '@/lib/jobs/types'

type EnqueuedCommunication = {
  messageId: string
  jobId: string
  status: string
  replay: boolean
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service-role configuration for post-call automation.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function asObject(value: JsonValue): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NonRetryableJobError(
      'The post-call dispatch payload is invalid.',
      'INVALID_POST_CALL_PAYLOAD',
    )
  }

  return value as Record<string, JsonValue>
}

function requiredString(
  value: JsonValue | undefined,
  label: string,
) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new NonRetryableJobError(
      `${label} is required.`,
      'INVALID_POST_CALL_PAYLOAD',
    )
  }

  return value.trim()
}

function parseEnqueuedCommunication(
  value: unknown,
): EnqueuedCommunication {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      'The post-call communication queue returned an invalid result.',
    )
  }

  const candidate = value as Record<string, unknown>

  if (
    typeof candidate.messageId !== 'string' ||
    typeof candidate.jobId !== 'string' ||
    typeof candidate.status !== 'string' ||
    typeof candidate.replay !== 'boolean'
  ) {
    throw new Error(
      'The post-call communication queue returned an incomplete result.',
    )
  }

  return {
    messageId: candidate.messageId,
    jobId: candidate.jobId,
    status: candidate.status,
    replay: candidate.replay,
  }
}

async function enqueueCommunication(input: {
  dispatchJobId: string
  organizationId: string
  contactId: string
  channel: 'email' | 'sms'
  recipient: string
  subject?: string | null
  body: string
}) {
  const client = createServiceClient()

  const { data, error } = await client.rpc(
    'enqueue_post_call_communication',
    {
      p_dispatch_job_id: input.dispatchJobId,
      p_organization_id: input.organizationId,
      p_contact_id: input.contactId,
      p_channel: input.channel,
      p_recipient: input.recipient,
      p_subject: input.subject ?? null,
      p_body: input.body,
    },
  )

  if (error) {
    throw new Error(
      `Unable to queue post-call ${input.channel}: ${error.message}`,
    )
  }

  return parseEnqueuedCommunication(data)
}

export async function executePostCallDispatch(input: {
  dispatchJobId: string
  payload: JsonValue
}): Promise<Record<string, JsonValue>> {
  const payload = asObject(input.payload)
  const organizationId = requiredString(
    payload.organizationId,
    'Organization ID',
  )
  const callId = requiredString(payload.callId, 'Call ID')

  const entitlement = await assertPostCallAutomationEntitlement(
    organizationId,
  )

  const rendered = await renderPostCallTemplates({
    organizationId,
    callId,
  })

  let aiGeneration:
    | Awaited<ReturnType<typeof generatePostCallFollowUp>>
    | null = null
  let aiFallbackReason: string | null = null

  try {
    aiGeneration = await generatePostCallFollowUp({
      dispatchJobId: input.dispatchJobId,
      organizationId,
      callId,
      rendered,
    })
  } catch (error) {
    aiFallbackReason = postCallAIFallbackReason(error)
    console.error(
      'Post-call AI personalization unavailable; using approved saved template.',
      {
        organizationId,
        callId,
        dispatchJobId: input.dispatchJobId,
        reason: aiFallbackReason,
      },
    )
  }

  const emailSubject =
    aiGeneration?.emailSubject ?? rendered.emailSubject
  const emailBody =
    aiGeneration?.emailBody ?? rendered.emailBody
  const smsBody =
    aiGeneration?.smsBody ?? rendered.smsBody

  let email: EnqueuedCommunication | null = null
  let sms: EnqueuedCommunication | null = null
  let emailSkippedReason: string | null = null
  let smsSkippedReason: string | null = null

  if (rendered.emailEnabled) {
    if (!rendered.recipientEmail) {
      emailSkippedReason = 'CONTACT_EMAIL_MISSING'
    } else if (!emailSubject || !emailBody) {
      throw new NonRetryableJobError(
        'The saved post-call email template is incomplete.',
        'POST_CALL_EMAIL_TEMPLATE_INCOMPLETE',
      )
    } else {
      email = await enqueueCommunication({
        dispatchJobId: input.dispatchJobId,
        organizationId,
        contactId: rendered.contactId,
        channel: 'email',
        recipient: rendered.recipientEmail,
        subject: emailSubject,
        body: emailBody,
      })
    }
  } else {
    emailSkippedReason = 'EMAIL_DISABLED'
  }

  if (rendered.smsEnabled) {
    if (!rendered.recipientPhone) {
      smsSkippedReason = 'CONTACT_PHONE_MISSING'
    } else if (!smsBody) {
      throw new NonRetryableJobError(
        'The saved post-call SMS template is incomplete.',
        'POST_CALL_SMS_TEMPLATE_INCOMPLETE',
      )
    } else {
      sms = await enqueueCommunication({
        dispatchJobId: input.dispatchJobId,
        organizationId,
        contactId: rendered.contactId,
        channel: 'sms',
        recipient: rendered.recipientPhone,
        body: smsBody,
      })
    }
  } else {
    smsSkippedReason = 'SMS_DISABLED'
  }

  const result = {
    organizationId,
    callId,
    contactId: rendered.contactId,
    emailEnabled: rendered.emailEnabled,
    emailMessageId: email?.messageId ?? null,
    emailJobId: email?.jobId ?? null,
    emailReplay: email?.replay ?? false,
    emailSkippedReason,
    smsEnabled: rendered.smsEnabled,
    smsMessageId: sms?.messageId ?? null,
    smsJobId: sms?.jobId ?? null,
    smsReplay: sms?.replay ?? false,
    smsSkippedReason,
    aiGenerated: aiGeneration !== null,
    aiGenerationId: aiGeneration?.generationId ?? null,
    aiGenerationReused: aiGeneration?.reused ?? false,
    aiFallbackReason,
  }

  await writeSystemAuditEvent({
    action: 'automation.post_call.dispatched',
    resourceType: 'background_job',
    resourceId: input.dispatchJobId,
    organizationId,
    outcome: 'success',
    source: 'background_job',
    metadata: {
      callId,
      contactId: rendered.contactId,
      planCode: entitlement.planCode,
      subscriptionStatus: entitlement.subscriptionStatus,
      emailEnabled: rendered.emailEnabled,
      emailMessageId: email?.messageId ?? null,
      emailJobId: email?.jobId ?? null,
      emailReplay: email?.replay ?? false,
      emailSkippedReason,
      smsEnabled: rendered.smsEnabled,
      smsMessageId: sms?.messageId ?? null,
      smsJobId: sms?.jobId ?? null,
      smsReplay: sms?.replay ?? false,
      smsSkippedReason,
      aiGenerated: aiGeneration !== null,
      aiGenerationId: aiGeneration?.generationId ?? null,
      aiGenerationReused: aiGeneration?.reused ?? false,
      aiProvider: aiGeneration?.provider ?? null,
      aiModel: aiGeneration?.model ?? null,
      aiFallbackReason,
    },
  })

  return result
}

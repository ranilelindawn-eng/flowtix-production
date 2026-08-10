import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

import {
  DeferredJobError,
  NonRetryableJobError,
} from '@/lib/jobs/types'

export type AutomationChannel = 'email' | 'sms' | 'call'
export type AutomationSource =
  | 'manual'
  | 'sequence'
  | 'campaign'
  | 'api'
  | 'system'
  | 'post_call_email'
  | 'post_call_sms'

type OrganizationPolicy = {
  timezone: string
  allowUnknownConsent: boolean
  emailPerMinute: number
  smsPerMinute: number
  callsPerMinute: number
  minimumRecipientIntervalSeconds: number
}

type ContactPreference = {
  do_not_contact: boolean
  email_consent_status: string
  sms_consent_status: string
  call_consent_status: string
  timezone: string | null
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service-role configuration for automation rules.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function toPositiveInteger(
  value: unknown,
  fallback: number,
): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : fallback
}

function consentStatusFor(
  preference: ContactPreference | null,
  channel: AutomationChannel,
) {
  if (!preference) {
    return 'unknown'
  }

  if (channel === 'email') {
    return preference.email_consent_status
  }

  if (channel === 'sms') {
    return preference.sms_consent_status
  }

  return preference.call_consent_status
}

async function loadPolicy(
  organizationId: string,
): Promise<OrganizationPolicy> {
  const client = createServiceClient()

  const { data, error } = await client
    .from('organizations')
    .select('timezone,communication_policy')
    .eq('id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Unable to load organization automation policy: ${error.message}`,
    )
  }

  if (!data) {
    throw new NonRetryableJobError(
      'The organization no longer exists.',
      'ORGANIZATION_NOT_FOUND',
    )
  }

  const policy =
    data.communication_policy &&
    typeof data.communication_policy === 'object' &&
    !Array.isArray(data.communication_policy)
      ? data.communication_policy as Record<string, unknown>
      : {}

  return {
    timezone:
      typeof data.timezone === 'string' && data.timezone.trim()
        ? data.timezone
        : 'UTC',
    allowUnknownConsent: policy.allow_unknown_consent === true,
    emailPerMinute: toPositiveInteger(
      policy.email_per_minute,
      60,
    ),
    smsPerMinute: toPositiveInteger(
      policy.sms_per_minute,
      30,
    ),
    callsPerMinute: toPositiveInteger(
      policy.calls_per_minute,
      10,
    ),
    minimumRecipientIntervalSeconds: toPositiveInteger(
      policy.minimum_recipient_interval_seconds,
      60,
    ),
  }
}

async function loadPreference(
  organizationId: string,
  contactId: string | null,
): Promise<ContactPreference | null> {
  if (!contactId) {
    return null
  }

  const client = createServiceClient()
  const { data, error } = await client
    .from('contact_communication_preferences')
    .select(
      'do_not_contact,email_consent_status,sms_consent_status,call_consent_status,timezone',
    )
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Unable to load contact communication preferences: ${error.message}`,
    )
  }

  return data as ContactPreference | null
}

function throttleLimit(
  policy: OrganizationPolicy,
  channel: AutomationChannel,
) {
  if (channel === 'email') {
    return policy.emailPerMinute
  }

  if (channel === 'sms') {
    return policy.smsPerMinute
  }

  return policy.callsPerMinute
}

export async function enforceAutomationRules(input: {
  organizationId: string
  contactId: string | null
  channel: AutomationChannel
  source: AutomationSource
  recipient: string
}): Promise<void> {
  const policy = await loadPolicy(input.organizationId)
  const preference = await loadPreference(
    input.organizationId,
    input.contactId,
  )

  if (preference?.do_not_contact) {
    throw new NonRetryableJobError(
      'The contact is on the workspace do-not-contact list.',
      'CONTACT_SUPPRESSED',
    )
  }

  const consent = consentStatusFor(preference, input.channel)

  if (
    consent === 'denied' ||
    consent === 'revoked' ||
    consent === 'opted_out'
  ) {
    throw new NonRetryableJobError(
      `The contact has not authorized ${input.channel} communication.`,
      'CONSENT_NOT_GRANTED',
    )
  }

  const automated = input.source !== 'manual'

  if (
    automated &&
    consent !== 'granted' &&
    !policy.allowUnknownConsent
  ) {
    throw new NonRetryableJobError(
      `Explicit ${input.channel} consent is required for automated communication.`,
      'CONSENT_REQUIRED',
    )
  }

  const recipientHash = createHash('sha256')
    .update(input.recipient.trim().toLowerCase())
    .digest('hex')

  const client = createServiceClient()
  const { data, error } = await client.rpc(
    'acquire_automation_throttle',
    {
      target_org: input.organizationId,
      throttle_channel: input.channel,
      recipient_hash_value: recipientHash,
      maximum_events: throttleLimit(
        policy,
        input.channel,
      ),
      window_seconds: 60,
      minimum_recipient_interval_seconds:
        policy.minimumRecipientIntervalSeconds,
    },
  )

  if (error) {
    throw new Error(
      `Unable to evaluate automation throttling: ${error.message}`,
    )
  }

  const row = Array.isArray(data) ? data[0] : data

  if (row?.allowed !== true) {
    const retryAt =
      typeof row?.retry_at === 'string'
        ? new Date(row.retry_at)
        : new Date(Date.now() + 60_000)

    throw new DeferredJobError(
      'The workspace or recipient throttle is currently active.',
      retryAt,
      typeof row?.reason === 'string'
        ? row.reason
        : 'AUTOMATION_THROTTLED',
    )
  }
}
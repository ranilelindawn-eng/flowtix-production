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

type BusinessWindow = {
  start: string
  end: string
}

type OrganizationPolicy = {
  timezone: string
  businessHours: Record<string, BusinessWindow[]>
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

const DEFAULT_BUSINESS_HOURS: Record<string, BusinessWindow[]> = {
  monday: [{ start: '09:00', end: '17:00' }],
  tuesday: [{ start: '09:00', end: '17:00' }],
  wednesday: [{ start: '09:00', end: '17:00' }],
  thursday: [{ start: '09:00', end: '17:00' }],
  friday: [{ start: '09:00', end: '17:00' }],
  saturday: [],
  sunday: [],
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

function normalizeBusinessHours(
  value: unknown,
): Record<string, BusinessWindow[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_BUSINESS_HOURS
  }

  const source = value as Record<string, unknown>
  const result: Record<string, BusinessWindow[]> = {}

  for (const day of Object.keys(DEFAULT_BUSINESS_HOURS)) {
    const windows = source[day]

    result[day] = Array.isArray(windows)
      ? windows.flatMap((window): BusinessWindow[] => {
          if (
            !window ||
            typeof window !== 'object' ||
            Array.isArray(window)
          ) {
            return []
          }

          const candidate = window as Record<string, unknown>

          if (
            typeof candidate.start !== 'string' ||
            typeof candidate.end !== 'string' ||
            !/^\d{2}:\d{2}$/.test(candidate.start) ||
            !/^\d{2}:\d{2}$/.test(candidate.end)
          ) {
            return []
          }

          return [{
            start: candidate.start,
            end: candidate.end,
          }]
        })
      : DEFAULT_BUSINESS_HOURS[day]
  }

  return result
}

function localDateParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return {
    weekday: parts.weekday.toLowerCase(),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function parseMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function nextBusinessOpening(
  now: Date,
  timezone: string,
  businessHours: Record<string, BusinessWindow[]>,
): Date {
  for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
    const candidate = new Date(
      now.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    )
    const local = localDateParts(candidate, timezone)
    const windows = businessHours[local.weekday] ?? []

    for (const window of windows) {
      const startMinutes = parseMinutes(window.start)

      if (dayOffset === 0 && startMinutes <= local.minutes) {
        continue
      }

      const deltaMinutes =
        dayOffset * 24 * 60 +
        Math.max(1, startMinutes - local.minutes)

      return new Date(now.getTime() + deltaMinutes * 60 * 1000)
    }
  }

  return new Date(now.getTime() + 24 * 60 * 60 * 1000)
}

function isInsideBusinessHours(
  now: Date,
  timezone: string,
  businessHours: Record<string, BusinessWindow[]>,
): boolean {
  const local = localDateParts(now, timezone)
  const windows = businessHours[local.weekday] ?? []

  return windows.some((window) => {
    const start = parseMinutes(window.start)
    const end = parseMinutes(window.end)

    return local.minutes >= start && local.minutes < end
  })
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
    .select('timezone,business_hours,communication_policy')
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
    businessHours: normalizeBusinessHours(data.business_hours),
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

  if (automated) {
    const timezone = preference?.timezone || policy.timezone
    const now = new Date()

    if (
      !isInsideBusinessHours(
        now,
        timezone,
        policy.businessHours,
      )
    ) {
      throw new DeferredJobError(
        'The communication is outside configured business hours.',
        nextBusinessOpening(
          now,
          timezone,
          policy.businessHours,
        ),
        'OUTSIDE_BUSINESS_HOURS',
      )
    }
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

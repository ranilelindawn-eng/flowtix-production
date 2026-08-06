import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import type {
  TelephonyAcceptanceCheck,
  TelephonyAcceptanceReport,
  TelephonyAcceptanceStatus,
} from './types'

type IntegrationRow = {
  id: string
  provider: string
  enabled: boolean
  status: string
  health_status: string | null
  last_health_check_at: string | null
  consecutive_failures: number | null
  reauthorization_required: boolean | null
}

type PhoneNumberRow = {
  provider: string
  phone_number: string
  capabilities: Record<string, unknown> | null
  is_default: boolean
}

type IntegrityReport = {
  expiredActiveReservations?: number
  staleOnlineDevices?: number
  staleAvailablePresence?: number
  expiredWrapUpPresence?: number
  staleWaitingQueueEntries?: number
  queueMemberReservationDrift?: number
}

function check(
  key: string,
  label: string,
  status: TelephonyAcceptanceStatus,
  detail: string,
): TelephonyAcceptanceCheck {
  return { key, label, status, detail }
}

function publicUrlCheck(): TelephonyAcceptanceCheck {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!value) return check('public-url', 'Public callback URL', 'fail', 'NEXT_PUBLIC_SITE_URL is not configured.')

  try {
    const parsed = new URL(value)
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      return check('public-url', 'Public callback URL', 'fail', 'Production callback URL must use HTTPS.')
    }
    return check('public-url', 'Public callback URL', 'pass', parsed.origin)
  } catch {
    return check('public-url', 'Public callback URL', 'fail', 'NEXT_PUBLIC_SITE_URL is not a valid absolute URL.')
  }
}

function overallStatus(checks: TelephonyAcceptanceCheck[]): TelephonyAcceptanceStatus {
  if (checks.some((item) => item.status === 'fail')) return 'fail'
  if (checks.some((item) => item.status === 'warning')) return 'warning'
  return 'pass'
}

function scoreChecks(checks: TelephonyAcceptanceCheck[]): number {
  if (checks.length === 0) return 0
  const points = checks.reduce((total, item) => {
    if (item.status === 'pass') return total + 1
    if (item.status === 'warning') return total + 0.5
    return total
  }, 0)
  return Math.round((points / checks.length) * 100)
}

export async function runTelephonyAcceptanceValidation(
  organizationId: string,
): Promise<TelephonyAcceptanceReport> {
  const admin = createTelephonyAdminClient()
  const checks: TelephonyAcceptanceCheck[] = [publicUrlCheck()]

  const [integrationsResult, secretsResult, numbersResult, eventsResult, snapshotsResult, integrityResult] =
    await Promise.all([
      admin
        .from('organization_integrations')
        .select('id,provider,enabled,status,health_status,last_health_check_at,consecutive_failures,reauthorization_required')
        .eq('organization_id', organizationId)
        .in('provider', ['twilio', 'telnyx']),
      admin
        .from('organization_integration_secrets')
        .select('integration_id')
        .eq('organization_id', organizationId),
      admin
        .from('organization_phone_numbers')
        .select('provider,phone_number,capabilities,is_default')
        .eq('organization_id', organizationId)
        .in('provider', ['twilio', 'telnyx']),
      admin
        .from('telephony_provider_events')
        .select('provider,processed_at')
        .eq('organization_id', organizationId)
        .order('processed_at', { ascending: false })
        .limit(1),
      admin
        .from('telephony_monitoring_snapshots')
        .select('captured_at')
        .eq('organization_id', organizationId)
        .order('captured_at', { ascending: false })
        .limit(1),
      admin.rpc('telephony_integrity_report', { target_organization: organizationId }),
    ])

  const queryErrors = [
    integrationsResult.error,
    secretsResult.error,
    numbersResult.error,
    eventsResult.error,
    snapshotsResult.error,
    integrityResult.error,
  ].filter(Boolean)

  if (queryErrors.length > 0) {
    checks.push(
      check(
        'database-readiness',
        'Telephony database readiness',
        'fail',
        queryErrors.map((error) => error?.message).filter(Boolean).join('; '),
      ),
    )
  } else {
    checks.push(check('database-readiness', 'Telephony database readiness', 'pass', 'Required telephony tables and functions are available.'))
  }

  const integrations = (integrationsResult.data ?? []) as IntegrationRow[]
  const secretIds = new Set(
    ((secretsResult.data ?? []) as Array<{ integration_id: string }>).map((row) => row.integration_id),
  )
  const numbers = (numbersResult.data ?? []) as PhoneNumberRow[]
  const connected = integrations.filter((row) => row.enabled && row.status === 'connected')

  if (connected.length === 0) {
    checks.push(check('provider-connection', 'Connected voice provider', 'fail', 'No connected Twilio or Telnyx integration is available.'))
  } else {
    checks.push(
      check(
        'provider-connection',
        'Connected voice provider',
        'pass',
        connected.map((row) => row.provider).join(', '),
      ),
    )
  }

  const missingSecrets = connected.filter((row) => !secretIds.has(row.id))
  checks.push(
    missingSecrets.length === 0 && connected.length > 0
      ? check('provider-secrets', 'Provider credentials', 'pass', 'Encrypted credentials exist for every connected voice provider.')
      : check('provider-secrets', 'Provider credentials', 'fail', missingSecrets.length > 0 ? `Missing credentials for ${missingSecrets.map((row) => row.provider).join(', ')}.` : 'No connected provider credentials can be validated.'),
  )

  const unhealthy = connected.filter(
    (row) => row.reauthorization_required || row.health_status === 'unhealthy' || row.health_status === 'reauthorization_required',
  )
  const degraded = connected.filter(
    (row) => row.health_status === 'degraded' || (row.consecutive_failures ?? 0) > 0,
  )
  checks.push(
    unhealthy.length > 0
      ? check('provider-health', 'Provider health', 'fail', `${unhealthy.map((row) => row.provider).join(', ')} requires attention or reauthorization.`)
      : degraded.length > 0
        ? check('provider-health', 'Provider health', 'warning', `${degraded.map((row) => row.provider).join(', ')} is degraded or has recent failures.`)
        : connected.length > 0
          ? check('provider-health', 'Provider health', 'pass', 'Connected provider health is acceptable.')
          : check('provider-health', 'Provider health', 'fail', 'Provider health cannot be assessed without a connection.'),
  )

  const voiceNumbers = numbers.filter((row) => row.capabilities?.voice !== false)
  const defaultProviders = new Set(numbers.filter((row) => row.is_default).map((row) => row.provider))
  const missingDefault = connected.filter((row) => !defaultProviders.has(row.provider))

  checks.push(
    voiceNumbers.length > 0
      ? check('voice-number', 'Voice-capable phone number', 'pass', `${voiceNumbers.length} voice-capable number${voiceNumbers.length === 1 ? '' : 's'} configured.`)
      : check('voice-number', 'Voice-capable phone number', 'fail', 'No voice-capable workspace phone number is configured.'),
  )
  checks.push(
    missingDefault.length === 0 && connected.length > 0
      ? check('default-number', 'Default caller ID', 'pass', 'Every connected provider has a default workspace number.')
      : check('default-number', 'Default caller ID', 'fail', missingDefault.length > 0 ? `Missing a default number for ${missingDefault.map((row) => row.provider).join(', ')}.` : 'No connected provider default number can be validated.'),
  )

  const latestEvent = (eventsResult.data ?? [])[0] as { provider?: string; processed_at?: string } | undefined
  if (!latestEvent?.processed_at) {
    checks.push(check('webhook-activity', 'Provider webhook activity', 'warning', 'No normalized provider webhook event has been recorded yet.'))
  } else {
    const ageHours = (Date.now() - new Date(latestEvent.processed_at).getTime()) / 3_600_000
    checks.push(
      ageHours <= 24
        ? check('webhook-activity', 'Provider webhook activity', 'pass', `Latest ${latestEvent.provider ?? 'provider'} event was processed within 24 hours.`)
        : check('webhook-activity', 'Provider webhook activity', 'warning', `No provider webhook event has been processed in the last ${Math.floor(ageHours)} hours.`),
    )
  }

  const latestSnapshot = (snapshotsResult.data ?? [])[0] as { captured_at?: string } | undefined
  if (!latestSnapshot?.captured_at) {
    checks.push(check('monitoring-snapshot', 'Monitoring collection', 'warning', 'No telephony monitoring snapshot has been collected yet.'))
  } else {
    const ageMinutes = (Date.now() - new Date(latestSnapshot.captured_at).getTime()) / 60_000
    checks.push(
      ageMinutes <= 15
        ? check('monitoring-snapshot', 'Monitoring collection', 'pass', 'The latest monitoring snapshot is fresh.')
        : check('monitoring-snapshot', 'Monitoring collection', 'warning', `The latest monitoring snapshot is ${Math.floor(ageMinutes)} minutes old.`),
    )
  }

  const integrity = (integrityResult.data ?? {}) as IntegrityReport
  const driftValues: unknown[] = [
    integrity.expiredActiveReservations,
    integrity.staleOnlineDevices,
    integrity.staleAvailablePresence,
    integrity.expiredWrapUpPresence,
    integrity.staleWaitingQueueEntries,
    integrity.queueMemberReservationDrift,
  ]
  const driftTotal = driftValues.reduce<number>(
    (total, value) => total + (Number(value) || 0),
    0,
  )

  checks.push(
    driftTotal === 0
      ? check('runtime-integrity', 'Runtime state integrity', 'pass', 'No stale reservations, devices, presence, queue entries, or reservation-counter drift detected.')
      : check('runtime-integrity', 'Runtime state integrity', 'warning', `${driftTotal} runtime integrity item${driftTotal === 1 ? '' : 's'} require maintenance recovery.`),
  )

  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    status: overallStatus(checks),
    score: scoreChecks(checks),
    checks,
  }
}

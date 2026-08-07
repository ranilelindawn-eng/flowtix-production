import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type Row = Record<string, unknown>

const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const asNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return 0
}

const asBoolean = (value: unknown): boolean => value === true

export type ProviderValidationFinding = {
  key: string
  severity: 'warning' | 'critical'
  count: number
  message: string
}

export type ProviderUsageValidationReport = {
  healthy: boolean
  score: number
  checkedAt: string
  telephony: {
    integrations: number
    connected: number
    enabled: number
    connectedMissingSecret: number
    secretOrganizationMismatch: number
    phoneNumbersWithoutIntegration: number
    callsLast24Hours: number
    failedCallsLast24Hours: number
    verificationFailuresLast24Hours: number
  }
  ai: {
    requestsThisMonth: number
    completedThisMonth: number
    failedThisMonth: number
    reserved: number
    expiredStillReserved: number
    completedMissingProvider: number
    completedMissingModel: number
    organizationsUsingAIThisMonth: number
    verificationFailuresLast24Hours: number
  }
  secrets: {
    encryptedIntegrationSecretRows: number
    authenticatedCanSelectEncryptedSecrets: boolean
    platformRpcSecretReferenceCount: number
    sensitivePlatformSettingKeys: number
  }
  findings: ProviderValidationFinding[]
}

function nestedNumber(source: Row, section: string, key: string): number {
  const nested = source[section]
  return isRecord(nested) ? asNumber(nested[key]) : 0
}

export async function getProviderUsageValidationReport(): Promise<ProviderUsageValidationReport> {
  await requirePlatformPermission('platform.dashboard.view')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_provider_usage_security_report',
  )

  if (error) {
    throw new Error(
      `Unable to run provider and usage validation: ${error.message}`,
    )
  }

  if (!isRecord(data)) {
    throw new Error('Provider and usage validation returned an invalid result.')
  }

  const secretRow = isRecord(data.secrets) ? data.secrets : {}
  const findingRows: unknown[] = Array.isArray(data.findings)
    ? data.findings
    : []

  const findings: ProviderValidationFinding[] = findingRows.flatMap((value) => {
    if (!isRecord(value)) return []

    const key = asString(value.key)
    const severityValue = asString(value.severity)
    const message = asString(value.message)

    if (
      !key ||
      (severityValue !== 'warning' && severityValue !== 'critical') ||
      !message
    ) {
      return []
    }

    const severity: ProviderValidationFinding['severity'] =
      severityValue

    return [{
      key,
      severity,
      count: asNumber(value.count),
      message,
    }]
  })

  return {
    healthy: asBoolean(data.healthy),
    score: asNumber(data.score),
    checkedAt: asString(data.checkedAt) ?? new Date(0).toISOString(),
    telephony: {
      integrations: nestedNumber(data, 'telephony', 'integrations'),
      connected: nestedNumber(data, 'telephony', 'connected'),
      enabled: nestedNumber(data, 'telephony', 'enabled'),
      connectedMissingSecret: nestedNumber(
        data,
        'telephony',
        'connectedMissingSecret',
      ),
      secretOrganizationMismatch: nestedNumber(
        data,
        'telephony',
        'secretOrganizationMismatch',
      ),
      phoneNumbersWithoutIntegration: nestedNumber(
        data,
        'telephony',
        'phoneNumbersWithoutIntegration',
      ),
      callsLast24Hours: nestedNumber(
        data,
        'telephony',
        'callsLast24Hours',
      ),
      failedCallsLast24Hours: nestedNumber(
        data,
        'telephony',
        'failedCallsLast24Hours',
      ),
      verificationFailuresLast24Hours: nestedNumber(
        data,
        'telephony',
        'verificationFailuresLast24Hours',
      ),
    },
    ai: {
      requestsThisMonth: nestedNumber(data, 'ai', 'requestsThisMonth'),
      completedThisMonth: nestedNumber(data, 'ai', 'completedThisMonth'),
      failedThisMonth: nestedNumber(data, 'ai', 'failedThisMonth'),
      reserved: nestedNumber(data, 'ai', 'reserved'),
      expiredStillReserved: nestedNumber(data, 'ai', 'expiredStillReserved'),
      completedMissingProvider: nestedNumber(
        data,
        'ai',
        'completedMissingProvider',
      ),
      completedMissingModel: nestedNumber(
        data,
        'ai',
        'completedMissingModel',
      ),
      organizationsUsingAIThisMonth: nestedNumber(
        data,
        'ai',
        'organizationsUsingAIThisMonth',
      ),
      verificationFailuresLast24Hours: nestedNumber(
        data,
        'ai',
        'verificationFailuresLast24Hours',
      ),
    },
    secrets: {
      encryptedIntegrationSecretRows: asNumber(
        secretRow.encryptedIntegrationSecretRows,
      ),
      authenticatedCanSelectEncryptedSecrets: asBoolean(
        secretRow.authenticatedCanSelectEncryptedSecrets,
      ),
      platformRpcSecretReferenceCount: asNumber(
        secretRow.platformRpcSecretReferenceCount,
      ),
      sensitivePlatformSettingKeys: asNumber(
        secretRow.sensitivePlatformSettingKeys,
      ),
    },
    findings,
  }
}

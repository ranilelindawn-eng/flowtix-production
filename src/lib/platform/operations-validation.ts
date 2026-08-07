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

export type OperationsValidationFinding = {
  key: string
  severity: 'warning' | 'critical'
  count: number
  message: string
}

export type OperationsValidationReport = {
  healthy: boolean
  score: number
  checkedAt: string
  jobs: {
    total: number
    ready: number
    processing: number
    staleLeases: number
    processingWithoutLease: number
    retryingWithoutNextRetry: number
    terminalWithWorkerLock: number
    attemptsOverMaximum: number
    deadLetterBeforeMaximum: number
    jobsWithoutEvents: number
  }
  health: {
    status: string
    score: number
    staleJobsReported: number
    staleLeaseCountMatches: boolean
  }
  flags: {
    configured: number
    expectedOperationalFlags: number
    missingExpectedFlags: number
    unknownFlags: number
    invalidRollouts: number
    overrides: number
    archivedOrganizationOverrides: number
    entitlementKeyCollisions: number
  }
  audit: {
    jobActions: number
    featureFlagActions: number
  }
  findings: OperationsValidationFinding[]
}

function nestedNumber(source: Row, section: string, key: string): number {
  const nested = source[section]
  return isRecord(nested) ? asNumber(nested[key]) : 0
}

export async function getOperationsValidationReport(): Promise<OperationsValidationReport> {
  await requirePlatformPermission('platform.flags.manage')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_operations_acceptance_report',
  )

  if (error) {
    throw new Error(
      `Unable to run jobs/health/feature-flags validation: ${error.message}`,
    )
  }

  if (!isRecord(data)) {
    throw new Error('Operations validation returned an invalid result.')
  }

  const health = isRecord(data.health) ? data.health : {}
  const findingRows: unknown[] = Array.isArray(data.findings)
    ? data.findings
    : []

  const findings: OperationsValidationFinding[] = findingRows.flatMap(
    (value) => {
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

      const severity: OperationsValidationFinding['severity'] =
        severityValue

      return [{
        key,
        severity,
        count: asNumber(value.count),
        message,
      }]
    },
  )

  return {
    healthy: asBoolean(data.healthy),
    score: asNumber(data.score),
    checkedAt: asString(data.checkedAt) ?? new Date(0).toISOString(),
    jobs: {
      total: nestedNumber(data, 'jobs', 'total'),
      ready: nestedNumber(data, 'jobs', 'ready'),
      processing: nestedNumber(data, 'jobs', 'processing'),
      staleLeases: nestedNumber(data, 'jobs', 'staleLeases'),
      processingWithoutLease: nestedNumber(
        data,
        'jobs',
        'processingWithoutLease',
      ),
      retryingWithoutNextRetry: nestedNumber(
        data,
        'jobs',
        'retryingWithoutNextRetry',
      ),
      terminalWithWorkerLock: nestedNumber(
        data,
        'jobs',
        'terminalWithWorkerLock',
      ),
      attemptsOverMaximum: nestedNumber(
        data,
        'jobs',
        'attemptsOverMaximum',
      ),
      deadLetterBeforeMaximum: nestedNumber(
        data,
        'jobs',
        'deadLetterBeforeMaximum',
      ),
      jobsWithoutEvents: nestedNumber(data, 'jobs', 'jobsWithoutEvents'),
    },
    health: {
      status: asString(health.status) ?? 'unknown',
      score: asNumber(health.score),
      staleJobsReported: asNumber(health.staleJobsReported),
      staleLeaseCountMatches: asBoolean(health.staleLeaseCountMatches),
    },
    flags: {
      configured: nestedNumber(data, 'flags', 'configured'),
      expectedOperationalFlags: nestedNumber(
        data,
        'flags',
        'expectedOperationalFlags',
      ),
      missingExpectedFlags: nestedNumber(
        data,
        'flags',
        'missingExpectedFlags',
      ),
      unknownFlags: nestedNumber(data, 'flags', 'unknownFlags'),
      invalidRollouts: nestedNumber(data, 'flags', 'invalidRollouts'),
      overrides: nestedNumber(data, 'flags', 'overrides'),
      archivedOrganizationOverrides: nestedNumber(
        data,
        'flags',
        'archivedOrganizationOverrides',
      ),
      entitlementKeyCollisions: nestedNumber(
        data,
        'flags',
        'entitlementKeyCollisions',
      ),
    },
    audit: {
      jobActions: nestedNumber(data, 'audit', 'jobActions'),
      featureFlagActions: nestedNumber(data, 'audit', 'featureFlagActions'),
    },
    findings,
  }
}

import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type Row = Record<string, unknown>

const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return 0
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const asBoolean = (value: unknown): boolean => value === true

export type SupportSecurityFinding = {
  key: string
  severity: 'warning' | 'critical'
  count: number
  message: string
}

export type SupportSecurityReport = {
  healthy: boolean
  score: number
  checkedAt: string
  policy: {
    sessionMinutes: number
    referenceRequired: boolean
  }
  sessions: {
    total: number
    active: number
    ended: number
    expiredButActive: number
    duplicateActiveActors: number
    overlongSessions: number
    missingRequiredReference: number
    inactivePlatformActors: number
  }
  isolation: {
    supportCreatedCustomerMemberships: number
    activePlatformCustomerMembershipRows: number
    platformIdentityCustomerHelpersDenied: boolean
    platformIdentityDashboardDenied: boolean
    staffMembershipCreationUsed: boolean
  }
  audit: {
    starts: number
    ends: number
    workspaceViews: number
    sessionsWithoutStartAudit: number
  }
  findings: SupportSecurityFinding[]
}

function nestedNumber(source: Row, section: string, key: string): number {
  const nested = source[section]
  return isRecord(nested) ? asNumber(nested[key]) : 0
}

export async function getSupportSecurityReport(): Promise<SupportSecurityReport> {
  await requirePlatformPermission('platform.impersonation.use')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_support_security_report',
  )

  if (error) {
    throw new Error(
      `Unable to run support security validation: ${error.message}`,
    )
  }

  if (!isRecord(data)) {
    throw new Error('Support security validation returned an invalid result.')
  }

  const policy = isRecord(data.policy) ? data.policy : {}
  const isolation = isRecord(data.isolation) ? data.isolation : {}
  const audit = isRecord(data.audit) ? data.audit : {}

  const findingRows: unknown[] = Array.isArray(data.findings)
    ? data.findings
    : []

  const findings: SupportSecurityFinding[] = findingRows.flatMap((value) => {
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

    const severity: SupportSecurityFinding['severity'] =
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
    policy: {
      sessionMinutes: asNumber(policy.sessionMinutes),
      referenceRequired: asBoolean(policy.referenceRequired),
    },
    sessions: {
      total: nestedNumber(data, 'sessions', 'total'),
      active: nestedNumber(data, 'sessions', 'active'),
      ended: nestedNumber(data, 'sessions', 'ended'),
      expiredButActive: nestedNumber(data, 'sessions', 'expiredButActive'),
      duplicateActiveActors: nestedNumber(data, 'sessions', 'duplicateActiveActors'),
      overlongSessions: nestedNumber(data, 'sessions', 'overlongSessions'),
      missingRequiredReference: nestedNumber(
        data,
        'sessions',
        'missingRequiredReference',
      ),
      inactivePlatformActors: nestedNumber(
        data,
        'sessions',
        'inactivePlatformActors',
      ),
    },
    isolation: {
      supportCreatedCustomerMemberships: asNumber(
        isolation.supportCreatedCustomerMemberships,
      ),
      activePlatformCustomerMembershipRows: asNumber(
        isolation.activePlatformCustomerMembershipRows,
      ),
      platformIdentityCustomerHelpersDenied: asBoolean(
        isolation.platformIdentityCustomerHelpersDenied,
      ),
      platformIdentityDashboardDenied: asBoolean(
        isolation.platformIdentityDashboardDenied,
      ),
      staffMembershipCreationUsed: asBoolean(
        isolation.staffMembershipCreationUsed,
      ),
    },
    audit: {
      starts: asNumber(audit.starts),
      ends: asNumber(audit.ends),
      workspaceViews: asNumber(audit.workspaceViews),
      sessionsWithoutStartAudit: asNumber(audit.sessionsWithoutStartAudit),
    },
    findings,
  }
}

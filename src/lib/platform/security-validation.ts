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

export type PlatformSecurityFinding = {
  key: string
  severity: 'warning' | 'critical'
  count: number
  message: string
}

export type PlatformSecurityReport = {
  healthy: boolean
  score: number
  checkedAt: string
  secrets: {
    encryptedSecretRows: number
    authenticatedTablePrivileges: number
    anonTablePrivileges: number
    browserReadableCiphertext: boolean
    secretLikePlatformSettings: number
    platformRpcSecretReferences: number
  }
  audit: {
    events: number
    updateDeletePrivileges: number
    immutableTriggerInstalled: boolean
    secretLikeAuditKeys: number
  }
  rpc: {
    publicPlatformFunctionPrivileges: number
    anonPlatformFunctionPrivileges: number
    publicSensitiveFunctionPrivileges: number
  }
  findings: PlatformSecurityFinding[]
}

export async function getPlatformSecurityReport(): Promise<PlatformSecurityReport> {
  await requirePlatformPermission('platform.audit.view')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_security_hardening_report',
  )

  if (error) {
    throw new Error(`Unable to run Platform security validation: ${error.message}`)
  }

  if (!isRecord(data)) {
    throw new Error('Platform security validation returned an invalid result.')
  }

  const secrets = isRecord(data.secrets) ? data.secrets : {}
  const audit = isRecord(data.audit) ? data.audit : {}
  const rpc = isRecord(data.rpc) ? data.rpc : {}
  const rows: unknown[] = Array.isArray(data.findings) ? data.findings : []

  const findings: PlatformSecurityFinding[] = rows.flatMap((value) => {
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

    const severity: PlatformSecurityFinding['severity'] = severityValue

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
    secrets: {
      encryptedSecretRows: asNumber(secrets.encryptedSecretRows),
      authenticatedTablePrivileges: asNumber(
        secrets.authenticatedTablePrivileges,
      ),
      anonTablePrivileges: asNumber(secrets.anonTablePrivileges),
      browserReadableCiphertext: asBoolean(secrets.browserReadableCiphertext),
      secretLikePlatformSettings: asNumber(
        secrets.secretLikePlatformSettings,
      ),
      platformRpcSecretReferences: asNumber(
        secrets.platformRpcSecretReferences,
      ),
    },
    audit: {
      events: asNumber(audit.events),
      updateDeletePrivileges: asNumber(audit.updateDeletePrivileges),
      immutableTriggerInstalled: asBoolean(audit.immutableTriggerInstalled),
      secretLikeAuditKeys: asNumber(audit.secretLikeAuditKeys),
    },
    rpc: {
      publicPlatformFunctionPrivileges: asNumber(
        rpc.publicPlatformFunctionPrivileges,
      ),
      anonPlatformFunctionPrivileges: asNumber(
        rpc.anonPlatformFunctionPrivileges,
      ),
      publicSensitiveFunctionPrivileges: asNumber(
        rpc.publicSensitiveFunctionPrivileges,
      ),
    },
    findings,
  }
}

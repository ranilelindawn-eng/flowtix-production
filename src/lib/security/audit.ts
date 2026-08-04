import { randomUUID } from 'node:crypto'

import { headers } from 'next/headers'

import { createClient } from '@/lib/supabase/server'

type AuditOutcome = 'success' | 'failure' | 'denied'
type AuditSource =
  | 'application'
  | 'database_trigger'
  | 'provider_webhook'
  | 'background_job'
  | 'system'

export type AuditEventInput = {
  action: string
  resourceType?: string | null
  resourceId?: string | null
  organizationId?: string | null
  targetUserId?: string | null
  outcome?: AuditOutcome
  source?: AuditSource
  metadata?: Record<string, unknown>
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  requestId?: string | null
}

function cleanText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function sanitizeMetadata(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!value) return {}

  const blockedKeys = new Set([
    'access_token',
    'refresh_token',
    'authorization',
    'client_secret',
    'api_key',
    'apiKey',
    'password',
    'secret',
    'token',
    'encrypted_credentials',
  ])

  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !blockedKeys.has(key)),
  )
}

export async function writeAuditEvent(
  input: AuditEventInput,
): Promise<string | null> {
  const action = cleanText(input.action)
  if (!action) {
    throw new Error('Audit action is required.')
  }

  const headerStore = await headers()
  const ipAddress =
    headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headerStore.get('x-real-ip')?.trim() ??
    null
  const userAgent = headerStore.get('user-agent') ?? null
  const requestId =
    cleanText(input.requestId) ??
    cleanText(headerStore.get('x-request-id')) ??
    cleanText(headerStore.get('x-vercel-id')) ??
    randomUUID()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('log_audit_event_v2', {
    p_action: action,
    p_resource_type: cleanText(input.resourceType),
    p_resource_id: cleanText(input.resourceId),
    p_organization_id: cleanText(input.organizationId),
    p_target_user_id: cleanText(input.targetUserId),
    p_outcome: input.outcome ?? 'success',
    p_source: input.source ?? 'application',
    p_metadata: sanitizeMetadata(input.metadata),
    p_old_values: input.oldValues
      ? sanitizeMetadata(input.oldValues)
      : null,
    p_new_values: input.newValues
      ? sanitizeMetadata(input.newValues)
      : null,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
    p_request_id: requestId,
  })

  if (error) {
    console.error('Audit logging failed:', {
      action,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      message: error.message,
    })
    return null
  }

  return typeof data === 'string' ? data : null
}

/**
 * Backwards-compatible helper used by existing Flowtix actions.
 */
export async function writeAuditLog(
  action: string,
  resourceType?: string,
  resourceId?: string,
  metadata: Record<string, unknown> = {},
): Promise<string | null> {
  return writeAuditEvent({
    action,
    resourceType,
    resourceId,
    metadata,
  })
}

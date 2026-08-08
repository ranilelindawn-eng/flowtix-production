import 'server-only'

import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

type AuditOutcome = 'success' | 'failure' | 'denied'
type AuditSource =
  | 'application'
  | 'database_trigger'
  | 'provider_webhook'
  | 'background_job'
  | 'system'

export type SystemAuditEventInput = {
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

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    return null
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Background-safe audit writer.
 *
 * This intentionally does not use next/headers because jobs and workers do not
 * have a browser request context. Audit failures are best-effort and must never
 * turn a successful durable job into a failed job.
 */
export async function writeSystemAuditEvent(
  input: SystemAuditEventInput,
): Promise<string | null> {
  const action = cleanText(input.action)
  if (!action) {
    console.error('Background audit logging skipped: action is required.')
    return null
  }

  const supabase = createServiceClient()
  if (!supabase) {
    console.error('Background audit logging skipped: service role is unavailable.', {
      action,
    })
    return null
  }

  const { data, error } = await supabase.rpc('log_audit_event_v2', {
    p_action: action,
    p_resource_type: cleanText(input.resourceType),
    p_resource_id: cleanText(input.resourceId),
    p_organization_id: cleanText(input.organizationId),
    p_target_user_id: cleanText(input.targetUserId),
    p_outcome: input.outcome ?? 'success',
    p_source: input.source ?? 'background_job',
    p_metadata: sanitizeMetadata(input.metadata),
    p_old_values: input.oldValues
      ? sanitizeMetadata(input.oldValues)
      : null,
    p_new_values: input.newValues
      ? sanitizeMetadata(input.newValues)
      : null,
    p_ip_address: null,
    p_user_agent: null,
    p_request_id: cleanText(input.requestId) ?? randomUUID(),
  })

  if (error) {
    console.error('Background audit logging failed:', {
      action,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      message: error.message,
    })
    return null
  }

  return typeof data === 'string' ? data : null
}

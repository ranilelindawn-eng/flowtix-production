import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'

export type JsonObject = Record<string, unknown>

type BeginRow = {
  action: 'acquired' | 'replay' | 'conflict' | 'in_progress'
  record_id: string
  response_status: number | null
  response_body: JsonObject | null
}

export type IdempotencyHandle = {
  recordId: string
  key: string
  replay: { status: number; body: JsonObject } | null
}

export class IdempotencyConflictError extends Error {
  readonly status = 409
  constructor(message = 'This idempotency key was already used for a different request.') {
    super(message)
    this.name = 'IdempotencyConflictError'
  }
}

export class IdempotencyInProgressError extends Error {
  readonly status = 425
  constructor(message = 'An identical request is already being processed. Try again shortly.') {
    super(message)
    this.name = 'IdempotencyInProgressError'
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    )
  }
  return value
}

export function hashIdempotencyPayload(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')
}

export function readIdempotencyKey(request: Request, supplied?: unknown): string | null {
  const header = request.headers.get('idempotency-key')?.trim()
  if (header) return header.slice(0, 200)
  if (typeof supplied === 'string' && supplied.trim()) return supplied.trim().slice(0, 200)
  return null
}

export function deriveWindowedIdempotencyKey(
  scope: string,
  payload: unknown,
  windowSeconds = 120,
): string {
  const bucket = Math.floor(Date.now() / (Math.max(10, windowSeconds) * 1000))
  return `${scope}:${bucket}:${hashIdempotencyPayload(payload).slice(0, 32)}`
}

export async function beginIdempotentOperation(input: {
  organizationId: string
  scope: string
  payload: unknown
  key?: string | null
  ttlSeconds?: number
  fallbackWindowSeconds?: number
}): Promise<IdempotencyHandle> {
  const key = input.key?.trim() || deriveWindowedIdempotencyKey(
    input.scope,
    input.payload,
    input.fallbackWindowSeconds ?? 120,
  )
  const requestHash = hashIdempotencyPayload(input.payload)
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('begin_idempotent_request', {
    target_org: input.organizationId,
    operation_scope: input.scope,
    operation_key: key,
    request_fingerprint: requestHash,
    ttl_seconds: input.ttlSeconds ?? 86_400,
  })
  if (error) throw new Error(`Unable to start idempotent operation: ${error.message}`)
  const row = (Array.isArray(data) ? data[0] : data) as BeginRow | null
  if (!row) throw new Error('The idempotency service returned no result.')
  if (row.action === 'conflict') throw new IdempotencyConflictError()
  if (row.action === 'in_progress') throw new IdempotencyInProgressError()
  return {
    recordId: row.record_id,
    key,
    replay: row.action === 'replay'
      ? { status: row.response_status ?? 200, body: row.response_body ?? {} }
      : null,
  }
}

export async function completeIdempotentOperation(
  handle: IdempotencyHandle,
  status: number,
  body: JsonObject,
  resource?: { type?: string | null; id?: string | null },
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.rpc('complete_idempotent_request', {
    target_record: handle.recordId,
    result_status: status,
    result_body: body,
    result_resource_type: resource?.type ?? null,
    result_resource_id: resource?.id ?? null,
  })
  if (error) throw new Error(`Unable to complete idempotent operation: ${error.message}`)
}

export async function failIdempotentOperation(
  handle: IdempotencyHandle | null,
  error: unknown,
  status = 500,
  body?: JsonObject,
): Promise<void> {
  if (!handle || handle.replay) return
  const message = error instanceof Error ? error.message : 'Operation failed.'
  const admin = createAdminClient()
  const { error: rpcError } = await admin.rpc('fail_idempotent_request', {
    target_record: handle.recordId,
    failure_status: status,
    failure_message: message,
    failure_body: body ?? { error: message },
  })
  if (rpcError) console.error('IDEMPOTENCY FAILURE RECORD ERROR', rpcError)
}

export function idempotencyErrorStatus(error: unknown): number | null {
  if (error instanceof IdempotencyConflictError) return error.status
  if (error instanceof IdempotencyInProgressError) return error.status
  return null
}

export function createOperationId(): string {
  return randomUUID()
}

export async function runIdempotentOperation<T extends JsonObject>(input: {
  organizationId: string
  scope: string
  payload: unknown
  key?: string | null
  ttlSeconds?: number
  fallbackWindowSeconds?: number
  execute: (handle: IdempotencyHandle) => Promise<{
    status?: number
    body: T
    resource?: { type?: string | null; id?: string | null }
  }>
}): Promise<{ status: number; body: T; replayed: boolean }> {
  const handle = await beginIdempotentOperation(input)
  if (handle.replay) {
    return {
      status: handle.replay.status,
      body: handle.replay.body as T,
      replayed: true,
    }
  }

  try {
    const result = await input.execute(handle)
    const status = result.status ?? 200
    await completeIdempotentOperation(handle, status, result.body, result.resource)
    return { status, body: result.body, replayed: false }
  } catch (error) {
    const status = idempotencyErrorStatus(error) ?? 500
    await failIdempotentOperation(handle, error, status)
    throw error
  }
}

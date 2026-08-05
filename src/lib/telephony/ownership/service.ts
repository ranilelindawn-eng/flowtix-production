import 'server-only'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import type { CallOwnershipLease, CallOwnershipTransferResult } from './types'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export async function acquireCallOwnershipLease(input: {
  organizationId: string
  callId: string
  userId: string
  leaseSeconds?: number
  metadata?: Record<string, unknown>
}): Promise<CallOwnershipLease> {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin.rpc('acquire_call_ownership_lease', {
    target_organization: input.organizationId,
    target_call: input.callId,
    target_user: input.userId,
    lease_seconds: input.leaseSeconds ?? 90,
    target_metadata: input.metadata ?? {},
  })
  if (error) throw new Error(`Unable to acquire call ownership lease: ${error.message}`)
  const result = record(data)
  return {
    acquired: result.acquired === true,
    leaseId: text(result.leaseId),
    leaseToken: text(result.leaseToken),
    expiresAt: text(result.expiresAt),
    reason: text(result.reason),
  }
}

export async function renewCallOwnershipLease(input: {
  organizationId: string
  leaseId: string
  leaseToken: string
  leaseSeconds?: number
}) {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin.rpc('renew_call_ownership_lease', {
    target_organization: input.organizationId,
    target_lease: input.leaseId,
    target_token: input.leaseToken,
    lease_seconds: input.leaseSeconds ?? 90,
  })
  if (error) throw new Error(`Unable to renew call ownership lease: ${error.message}`)
  return record(data)
}

export async function releaseCallOwnershipLease(input: {
  organizationId: string
  leaseId: string
  leaseToken: string
  reason?: string
}) {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin.rpc('release_call_ownership_lease', {
    target_organization: input.organizationId,
    target_lease: input.leaseId,
    target_token: input.leaseToken,
    target_reason: input.reason ?? 'released',
  })
  if (error) throw new Error(`Unable to release call ownership lease: ${error.message}`)
  return data === true
}

export async function expireCallOwnershipLeases(input?: {
  organizationId?: string | null
  callId?: string | null
}) {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin.rpc('expire_call_ownership_leases', {
    target_organization: input?.organizationId ?? null,
    target_call: input?.callId ?? null,
  })
  if (error) throw new Error(`Unable to expire call ownership leases: ${error.message}`)
  return typeof data === 'number' ? data : 0
}

export async function transferCallOwnership(input: {
  organizationId: string
  callId: string
  actingUserId: string
  targetUserId: string
  expectedVersion: number
  reason?: string | null
  metadata?: Record<string, unknown>
}): Promise<CallOwnershipTransferResult> {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin.rpc('transfer_call_ownership', {
    target_organization: input.organizationId,
    target_call: input.callId,
    acting_user: input.actingUserId,
    target_user: input.targetUserId,
    expected_version: input.expectedVersion,
    target_reason: input.reason ?? null,
    target_metadata: input.metadata ?? {},
  })
  if (error) throw new Error(`Unable to transfer call ownership: ${error.message}`)
  const result = record(data)
  return {
    transferred: result.transferred === true,
    ownerUserId: text(result.ownerUserId),
    version: number(result.version),
    reason: text(result.reason),
  }
}

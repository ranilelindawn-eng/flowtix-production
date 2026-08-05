import 'server-only'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import type { QueueEnqueueResult, QueueReservationResult } from './types'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function integer(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
}

export async function enqueueInboundCall(input: {
  organizationId: string
  queueId: string
  callId: string
  routingAttemptId: string
  provider: string
  providerCallId: string
  priority?: number
  metadata?: Record<string, unknown>
}): Promise<QueueEnqueueResult> {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin.rpc('enqueue_call_queue_entry', {
    target_organization: input.organizationId,
    target_queue: input.queueId,
    target_call: input.callId,
    target_attempt: input.routingAttemptId,
    target_provider: input.provider,
    target_provider_call_id: input.providerCallId,
    target_priority: input.priority ?? 0,
    target_metadata: input.metadata ?? {},
  })
  if (error) throw new Error(`Unable to enqueue inbound call: ${error.message}`)
  const result = record(data)
  return {
    accepted: result.accepted === true,
    entryId: text(result.entryId),
    position: integer(result.position),
    estimatedWaitSeconds: integer(result.estimatedWaitSeconds),
    maxWaitSeconds: integer(result.maxWaitSeconds, 120),
    announcePosition: result.announcePosition !== false,
    announceEstimatedWait: result.announceEstimatedWait !== false,
    overflowQueueId: text(result.overflowQueueId),
    overflowNumber: text(result.overflowNumber),
    reason: text(result.reason),
  }
}

export async function reserveNextQueueCall(input: {
  organizationId: string
  queueId: string
  userId: string
}): Promise<QueueReservationResult> {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin.rpc('reserve_next_call_queue_entry', {
    target_organization: input.organizationId,
    target_queue: input.queueId,
    target_user: input.userId,
  })
  if (error) throw new Error(`Unable to reserve queue call: ${error.message}`)
  const result = record(data)
  return {
    reserved: result.reserved === true,
    reservationId: text(result.reservationId),
    entryId: text(result.entryId),
    callId: text(result.callId),
    providerCallId: text(result.providerCallId),
    reason: text(result.reason),
  }
}

export async function releaseQueueReservation(input: {
  organizationId: string
  reservationId: string
  reason: string
  requeue?: boolean
}) {
  const admin = createTelephonyAdminClient()
  const { error } = await admin.rpc('release_call_queue_reservation', {
    target_organization: input.organizationId,
    target_reservation: input.reservationId,
    target_reason: input.reason,
    should_requeue: input.requeue ?? true,
  })
  if (error) throw new Error(`Unable to release queue reservation: ${error.message}`)
}

export async function completeQueueReservation(input: {
  organizationId: string
  reservationId: string
  providerChildCallId?: string | null
}) {
  const admin = createTelephonyAdminClient()
  const { error } = await admin.rpc('complete_call_queue_reservation', {
    target_organization: input.organizationId,
    target_reservation: input.reservationId,
    target_provider_child_call_id: input.providerChildCallId ?? null,
  })
  if (error) throw new Error(`Unable to complete queue reservation: ${error.message}`)
}

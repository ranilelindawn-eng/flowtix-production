import type { SupabaseClient } from '@supabase/supabase-js'

import type { AIUsageCompletion, AIUsageFeature, AIUsageReservation } from './types'

type ReservationRow = {
  id: string
  organization_id: string
  feature: AIUsageFeature
  status: AIUsageReservation['status']
  idempotency_key: string
}

export class AIUsageControlError extends Error {
  readonly code = 'AI_USAGE_CONTROLLED'
  readonly status = 402
}

function mapReservation(row: ReservationRow): AIUsageReservation {
  return { id: row.id, organizationId: row.organization_id, feature: row.feature, status: row.status, idempotencyKey: row.idempotency_key }
}

function normalizeError(error: { message?: string }): never {
  const message = error.message ?? 'AI usage could not be reserved.'
  if (message.includes('AI_') || message.includes('USAGE_LIMIT_REACHED')) throw new AIUsageControlError(message)
  throw new Error(message)
}

export async function reserveAIUsage(
  supabase: SupabaseClient,
  input: { organizationId: string; feature: AIUsageFeature; idempotencyKey: string; estimatedInputTokens?: number; estimatedOutputTokens?: number },
): Promise<AIUsageReservation> {
  const { data, error } = await supabase.rpc('reserve_ai_usage', {
    target_org: input.organizationId,
    usage_feature: input.feature,
    usage_idempotency_key: input.idempotencyKey,
    estimated_input: Math.max(0, Math.trunc(input.estimatedInputTokens ?? 0)),
    estimated_output: Math.max(0, Math.trunc(input.estimatedOutputTokens ?? 0)),
    reservation_seconds: 900,
  })
  if (error) normalizeError(error)
  return mapReservation(data as ReservationRow)
}

export async function completeAIUsage(supabase: SupabaseClient, reservationId: string, result: AIUsageCompletion): Promise<void> {
  const { error } = await supabase.rpc('finalize_ai_usage', {
    reservation_id: reservationId,
    result_status: 'completed',
    result_provider: result.provider ?? null,
    result_model: result.model ?? null,
    actual_input_tokens: result.inputTokens ?? null,
    actual_output_tokens: result.outputTokens ?? null,
    result_cost_micros: result.costMicros ?? null,
    result_request_id: result.requestId ?? null,
    result_latency_ms: result.latencyMs ?? null,
    result_error_code: null,
    result_error_message: null,
    result_metadata: result.metadata ?? {},
  })
  if (error) normalizeError(error)
}

export async function failAIUsage(supabase: SupabaseClient, reservationId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Unknown AI execution error.'
  await supabase.rpc('finalize_ai_usage', {
    reservation_id: reservationId, result_status: 'failed', result_provider: null, result_model: null,
    actual_input_tokens: null, actual_output_tokens: null, result_cost_micros: null, result_request_id: null,
    result_latency_ms: null, result_error_code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
    result_error_message: message, result_metadata: {},
  })
}

export function isAIUsageControlError(error: unknown): error is AIUsageControlError {
  return error instanceof AIUsageControlError
}

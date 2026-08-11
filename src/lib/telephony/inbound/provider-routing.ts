import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { createInboundRoute } from '@/lib/telephony/routing/engine'
import type { ConfiguredTelephonyProviderName } from '@/lib/telephony/provider'
import type { RoutingTarget } from '@/lib/telephony/routing/types'

export function normalizeE164(value: string): string | null {
  const normalized = value.trim()
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null
}

export async function resolveOwnedInboundNumber(input: {
  provider: ConfiguredTelephonyProviderName
  calledNumber: string
}) {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin
    .from('organization_phone_numbers')
    .select('organization_id,phone_number,capabilities,recording_enabled')
    .eq('phone_number', input.calledNumber)
    .eq('provider', input.provider)
    .maybeSingle()

  if (error) throw new Error(`Unable to resolve inbound ${input.provider} number: ${error.message}`)
  if (!data) return null
  const capabilities =
    data.capabilities && typeof data.capabilities === 'object'
      ? (data.capabilities as Record<string, unknown>)
      : {}
  if (capabilities.voice === false) return null
  return data
}

export async function buildProviderInboundRoute(input: {
  provider: ConfiguredTelephonyProviderName
  organizationId: string
  providerCallId: string
  fromNumber: string
  toNumber: string
}) {
  const admin = createTelephonyAdminClient()
  const { data: owner, error } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', input.organizationId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve workspace owner: ${error.message}`)

  return createInboundRoute({
    organizationId: input.organizationId,
    provider: input.provider,
    providerCallId: input.providerCallId,
    fromNumber: input.fromNumber,
    toNumber: input.toNumber,
    createdBy: owner?.user_id ?? null,
  })
}

export function primaryTargets(targets: RoutingTarget[]): RoutingTarget[] {
  return targets.filter((target) => target.tier === 0)
}

export function overflowTargets(targets: RoutingTarget[]): RoutingTarget[] {
  return targets.filter((target) => target.tier > 0)
}

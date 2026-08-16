import { NextResponse } from 'next/server'

import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import {
  getAgentPresence,
  heartbeatAgentDevice,
  setAgentAvailability,
} from '@/lib/telephony/presence/service'
import type { AgentAvailability, AgentDeviceStatus } from '@/lib/telephony/presence/types'

async function context() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  const organization = await getCurrentOrganization()
  if (typeof userId !== 'string' || !organization) return null
  return { userId, organization }
}

export async function GET() {
  try {
    const current = await context()
    if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasPermission(current.organization.role, 'calls.create')) {
      return NextResponse.json({ error: 'You do not have permission to use the dialer.' }, { status: 403 })
    }
    await assertEntitlement('dialer.cloud', current.organization.organization_id)
    return NextResponse.json(
      await getAgentPresence(current.organization.organization_id, current.userId),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load presence.' },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const current = await context()
    if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasPermission(current.organization.role, 'calls.create')) {
      return NextResponse.json({ error: 'You do not have permission to use the dialer.' }, { status: 403 })
    }
    await assertEntitlement('dialer.cloud', current.organization.organization_id)

    const body = (await request.json()) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : 'heartbeat'
    const organizationId = current.organization.organization_id

    if (action === 'availability') {
      const availability = body.availability as AgentAvailability
      if (!['available', 'away', 'offline', 'dnd'].includes(availability)) {
        return NextResponse.json({ error: 'Invalid availability.' }, { status: 400 })
      }
      return NextResponse.json(
        await setAgentAvailability({ organizationId, userId: current.userId, availability }),
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    // Call activity is provider-controlled. Browser clients must not mark themselves
    // busy, ringing, or in wrap-up for an arbitrary call.
    if (action === 'activity') {
      return NextResponse.json(
        { error: 'Call activity is managed by the telephony service.' },
        { status: 403 },
      )
    }

    if (action !== 'heartbeat') {
      return NextResponse.json({ error: 'Unsupported presence action.' }, { status: 400 })
    }

    const deviceKey = typeof body.deviceKey === 'string' ? body.deviceKey.trim() : ''
    const status = body.status as AgentDeviceStatus
    if (!deviceKey || deviceKey.length > 160 || !['online', 'offline', 'error'].includes(status)) {
      return NextResponse.json(
        { error: 'Valid deviceKey and status are required.' },
        { status: 400 },
      )
    }

    const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : 'browser'
    if (!['browser', 'signalwire'].includes(provider)) {
      return NextResponse.json({ error: 'Unsupported device provider.' }, { status: 400 })
    }

    return NextResponse.json(
      await heartbeatAgentDevice({
        organizationId,
        userId: current.userId,
        deviceKey,
        status,
        provider,
        providerIdentity:
          typeof body.providerIdentity === 'string' ? body.providerIdentity.slice(0, 255) : null,
        supportsInbound: false,
        // Active call ownership is provider-controlled, not browser-controlled.
        callId: null,
        metadata:
          body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : {},
      }),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update presence.' },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

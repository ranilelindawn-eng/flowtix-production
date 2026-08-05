import { NextResponse } from 'next/server'

import { getCurrentOrganization } from '@/lib/team'
import { createClient } from '@/lib/supabase/server'
import { getAgentPresence, heartbeatAgentDevice, setAgentAvailability, setAgentCallActivity } from '@/lib/telephony/presence/service'
import type { AgentActivityState, AgentAvailability, AgentDeviceStatus } from '@/lib/telephony/presence/types'

async function context() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  const organization = await getCurrentOrganization()
  if (typeof userId !== 'string' || !organization) return null
  return { userId, organizationId: organization.organization_id }
}

export async function GET() {
  const current = await context()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getAgentPresence(current.organizationId, current.userId))
}

export async function POST(request: Request) {
  try {
    const current = await context()
    if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json() as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : 'heartbeat'

    if (action === 'availability') {
      const availability = body.availability as AgentAvailability
      if (!['available','away','offline','dnd'].includes(availability)) return NextResponse.json({ error: 'Invalid availability.' }, { status: 400 })
      return NextResponse.json(await setAgentAvailability({ ...current, availability }))
    }

    if (action === 'activity') {
      const state = body.state as AgentActivityState
      if (!['idle','ringing','busy','wrap_up'].includes(state)) return NextResponse.json({ error: 'Invalid activity state.' }, { status: 400 })
      return NextResponse.json(await setAgentCallActivity({ ...current, state, callId: typeof body.callId === 'string' ? body.callId : null, wrapUpSeconds: typeof body.wrapUpSeconds === 'number' ? body.wrapUpSeconds : 30 }))
    }

    const deviceKey = typeof body.deviceKey === 'string' ? body.deviceKey.trim() : ''
    const status = body.status as AgentDeviceStatus
    if (!deviceKey || !['online','offline','error'].includes(status)) return NextResponse.json({ error: 'Valid deviceKey and status are required.' }, { status: 400 })
    return NextResponse.json(await heartbeatAgentDevice({
      ...current, deviceKey, status, provider: typeof body.provider === 'string' ? body.provider : 'browser',
      providerIdentity: typeof body.providerIdentity === 'string' ? body.providerIdentity : null,
      supportsInbound: body.supportsInbound !== false, callId: typeof body.callId === 'string' ? body.callId : null,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : {},
    }))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update presence.' }, { status: 500 })
  }
}

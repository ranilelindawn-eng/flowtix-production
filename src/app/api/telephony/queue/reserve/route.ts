import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { reserveNextQueueCall } from '@/lib/telephony/queues/service'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    const userId = data?.claims?.sub
    const organization = await getCurrentOrganization()
    if (typeof userId !== 'string' || !organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const queueId = typeof body.queueId === 'string' ? body.queueId.trim() : ''
    if (!queueId) {
      return NextResponse.json({ error: 'queueId is required.' }, { status: 400 })
    }

    const reservation = await reserveNextQueueCall({
      organizationId: organization.organization_id,
      queueId,
      userId,
    })
    return NextResponse.json(reservation, { status: reservation.reserved ? 200 : 409 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to reserve queue call.' },
      { status: 500 },
    )
  }
}

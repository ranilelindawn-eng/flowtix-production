import { NextResponse } from 'next/server'

import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { hangupMoceanCall } from '@/lib/telephony/mocean'
import { getCurrentOrganization } from '@/lib/team'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    const userId = data?.claims?.sub
    const organization = await getCurrentOrganization()
    if (typeof userId !== 'string' || !organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasPermission(organization.role, 'calls.create')) return NextResponse.json({ error: 'You do not have permission to end calls.' }, { status: 403 })

    const payload = await request.json() as Record<string, unknown>
    const callId = typeof payload.callId === 'string' ? payload.callId.trim() : ''
    if (!callId) return NextResponse.json({ error: 'Call ID is required.' }, { status: 400 })

    const admin = createTelephonyAdminClient()
    const { data: call, error } = await admin.from('calls')
      .select('id,provider_call_sid,created_by,status')
      .eq('id', callId).eq('organization_id', organization.organization_id).eq('provider', 'mocean').maybeSingle()
    if (error) throw new Error(error.message)
    if (!call || (organization.role === 'agent' && call.created_by !== userId)) return NextResponse.json({ error: 'Call not found.' }, { status: 404 })
    if (['completed','failed','cancelled'].includes(call.status)) return NextResponse.json({ ok: true, status: call.status })
    if (!call.provider_call_sid) throw new Error('The provider call identifier is not available yet.')

    await hangupMoceanCall(call.provider_call_sid)
    const now = new Date().toISOString()
    await admin.from('calls').update({ status: 'cancelled', ended_at: now, provider_status_raw: 'hangup_requested', provider_event_at: now, updated_at: now }).eq('id', call.id)
    return NextResponse.json({ ok: true, status: 'cancelled' })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to end managed call.' }, { status: 500 })
  }
}

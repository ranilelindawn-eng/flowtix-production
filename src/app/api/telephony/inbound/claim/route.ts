import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { isTelephonyProvider } from '@/lib/telephony/provider'
import { setAgentCallActivity } from '@/lib/telephony/presence/service'

function e164(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    const userId = data?.claims?.sub
    const organization = await getCurrentOrganization()
    if (typeof userId !== 'string' || !organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as Record<string, unknown>
    const provider = typeof body.provider === 'string' ? body.provider.trim() : ''
    if (!isTelephonyProvider(provider)) {
      return NextResponse.json({ error: 'Unsupported provider.' }, { status: 400 })
    }
    const childProviderCallId =
      typeof body.providerCallId === 'string' ? body.providerCallId.trim() || null : null
    const fromNumber = e164(body.fromNumber)
    const admin = createTelephonyAdminClient()
    const cutoff = new Date(Date.now() - 3 * 60_000).toISOString()

    let query = admin
      .from('calls')
      .select('id,routing_attempt_id')
      .eq('organization_id', organization.organization_id)
      .eq('provider', provider)
      .eq('direction', 'inbound')
      .in('routing_status', ['routing', 'ringing'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(10)
    if (fromNumber) query = query.eq('from_number', fromNumber)

    const { data: calls, error: callsError } = await query
    if (callsError) throw new Error(callsError.message)

    for (const call of calls ?? []) {
      if (!call.routing_attempt_id) continue
      const { data: attempt, error: attemptError } = await admin
        .from('call_routing_attempts')
        .select('id,ring_group_id,selected_user_ids,status')
        .eq('id', call.routing_attempt_id)
        .eq('organization_id', organization.organization_id)
        .contains('selected_user_ids', [userId])
        .maybeSingle()
      if (attemptError) throw new Error(attemptError.message)
      if (!attempt || !['created', 'routing', 'ringing'].includes(attempt.status)) continue

      const { data: claimed, error: claimError } = await admin.rpc('claim_inbound_call_answer', {
        target_organization: organization.organization_id,
        target_attempt: attempt.id,
        target_user: userId,
        child_provider_call_id: childProviderCallId,
      })
      if (claimError) throw new Error(claimError.message)
      if (!claimed) continue

      if (attempt.ring_group_id) {
        await admin.rpc('mark_ring_group_member_answered', {
          target_organization: organization.organization_id,
          target_ring_group: attempt.ring_group_id,
          target_user: userId,
        })
      }
      await setAgentCallActivity({
        organizationId: organization.organization_id,
        userId,
        state: 'busy',
        callId: call.id,
      })
      return NextResponse.json({ claimed: true, callId: call.id })
    }

    return NextResponse.json({ claimed: false })
  } catch (error) {
    console.error('Unable to claim inbound browser call:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to claim inbound call.' },
      { status: 500 },
    )
  }
}

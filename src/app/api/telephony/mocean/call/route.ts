import { NextResponse } from 'next/server'

import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { hasPermission } from '@/lib/permissions'
import { writeAuditEvent } from '@/lib/security/audit'
import { createClient } from '@/lib/supabase/server'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { isMoceanManagedOutboundConfigured, normalizeE164, startMoceanManagedCall } from '@/lib/telephony/mocean'
import { getCurrentOrganization } from '@/lib/team'
import { assertCallCapacity, isUsageLimitError } from '@/lib/usage-limits'

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }

async function authContext() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  const organization = await getCurrentOrganization()
  if (typeof userId !== 'string' || !organization) return null
  return { userId, organization }
}

export async function GET(request: Request) {
  try {
    const current = await authContext()
    if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const callId = new URL(request.url).searchParams.get('callId')?.trim() ?? ''
    if (!callId) return NextResponse.json({ error: 'Call ID is required.' }, { status: 400 })

    const admin = createTelephonyAdminClient()
    const { data: call, error } = await admin
      .from('calls')
      .select('id,status,started_at,ended_at,duration_seconds,provider_call_sid,provider_status_raw,recording_available,created_by')
      .eq('id', callId)
      .eq('organization_id', current.organization.organization_id)
      .eq('provider', 'mocean')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!call || (current.organization.role === 'agent' && call.created_by !== current.userId)) {
      return NextResponse.json({ error: 'Call not found.' }, { status: 404 })
    }
    return NextResponse.json({ call })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load call.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let insertedCallId: string | null = null
  try {
    const current = await authContext()
    if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasPermission(current.organization.role, 'calls.create')) {
      return NextResponse.json({ error: 'You do not have permission to place calls.' }, { status: 403 })
    }
    await assertEntitlement('dialer.cloud', current.organization.organization_id)
    await assertCallCapacity(current.organization.organization_id)
    if (!isMoceanManagedOutboundConfigured()) throw new Error('Flowtix Managed Calling is not configured.')

    const payload = await request.json() as Record<string, unknown>
    const destinationNumber = normalizeE164(text(payload.toNumber))
    const contactId = text(payload.contactId) || null
    const recordCall = payload.recordCall !== false
    const admin = createTelephonyAdminClient()

    const { data: setting, error: settingError } = await admin
      .from('telephony_agent_settings')
      .select('callback_number')
      .eq('organization_id', current.organization.organization_id)
      .eq('user_id', current.userId)
      .maybeSingle()
    if (settingError) throw new Error(settingError.message)
    if (!setting?.callback_number) {
      return NextResponse.json({ error: 'Save your agent callback number before placing a call.' }, { status: 400 })
    }
    const agentNumber = normalizeE164(setting.callback_number)

    if (contactId) {
      let query = admin.from('contacts').select('id,owner_membership_id').eq('id', contactId).eq('organization_id', current.organization.organization_id)
      if (current.organization.role === 'agent') query = query.eq('owner_membership_id', current.organization.membership_id)
      const { data: contact, error } = await query.maybeSingle()
      if (error) throw new Error(error.message)
      if (!contact) return NextResponse.json({ error: 'The selected contact is unavailable or is not assigned to you.' }, { status: 403 })
    }

    const now = new Date().toISOString()
    const { data: inserted, error: insertError } = await admin.from('calls').insert({
      organization_id: current.organization.organization_id,
      contact_id: contactId,
      direction: 'outbound',
      status: 'initiating',
      started_at: now,
      recording_available: false,
      created_by: current.userId,
      provider: 'mocean',
      from_number: agentNumber,
      to_number: destinationNumber,
      metadata: { source: 'flowtix_managed_outbound', provider: 'mocean', agent_callback_number: agentNumber, record_requested: recordCall },
    }).select('id').single()
    if (insertError) throw new Error(`Unable to create call record: ${insertError.message}`)
    insertedCallId = inserted.id

    const provider = await startMoceanManagedCall({ callId: inserted.id, agentNumber, destinationNumber, recordCall })
    const { error: updateError } = await admin.from('calls').update({
      provider_call_sid: provider.callUuid,
      provider_child_call_sid: provider.sessionUuid || null,
      status: 'ringing',
      provider_status_raw: 'accepted',
      provider_event_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', inserted.id).eq('organization_id', current.organization.organization_id)
    if (updateError) throw new Error(`Call started, but Flowtix could not persist provider identifiers: ${updateError.message}`)

    await writeAuditEvent({
      action: 'telephony.mocean.call.started',
      resourceType: 'call',
      resourceId: inserted.id,
      organizationId: current.organization.organization_id,
      metadata: { provider: 'mocean', contactId, recordCall },
    })

    return NextResponse.json({
      callId: inserted.id,
      providerCallId: provider.callUuid,
      status: 'ringing',
      message: 'Calling your agent phone. Answer it to connect the customer.',
    })
  } catch (error) {
    if (insertedCallId) {
      const admin = createTelephonyAdminClient()
      try {
        await admin.from('calls').update({
          status: 'failed',
          ended_at: new Date().toISOString(),
          provider_status_raw: error instanceof Error ? error.message.slice(0, 240) : 'provider_error',
          updated_at: new Date().toISOString(),
        }).eq('id', insertedCallId)
      } catch {
        // Preserve the original provider error if failure-state persistence also fails.
      }
    }
    const status = isEntitlementError(error) || isUsageLimitError(error) ? 403 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start managed outbound call.' }, { status })
  }
}

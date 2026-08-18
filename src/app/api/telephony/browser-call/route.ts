import { NextResponse } from 'next/server'

import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { hasPermission } from '@/lib/permissions'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { resolvePlatformManagedCallerId } from '@/lib/telephony/platform-managed-calling'
import {
  isTelephonyProvider,
  type ConfiguredTelephonyProviderName,
} from '@/lib/telephony/provider'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

const MAX_PROVIDER_CALL_ID_LENGTH = 160

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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
    if (!hasPermission(organization.role, 'calls.create')) {
      return NextResponse.json(
        { error: 'You do not have permission to place calls.' },
        { status: 403 },
      )
    }
    await assertEntitlement('dialer.cloud', organization.organization_id)

    const payload = (await request.json()) as Record<string, unknown>
    const providerValue = text(payload.provider)
    const providerCallId = text(payload.providerCallId)
    const toNumber = text(payload.toNumber)
    const contactId = text(payload.contactId) || null

    if (!isTelephonyProvider(providerValue) || providerValue !== 'signalwire') {
      return NextResponse.json(
        { error: 'Only Flowtix browser call registration is supported.' },
        { status: 400 },
      )
    }
    const provider: ConfiguredTelephonyProviderName = 'signalwire'

    if (
      !providerCallId ||
      providerCallId.length > MAX_PROVIDER_CALL_ID_LENGTH ||
      !/^\+[1-9]\d{7,14}$/.test(toNumber)
    ) {
      return NextResponse.json(
        { error: 'Invalid browser call registration.' },
        { status: 400 },
      )
    }

    // Never trust a browser-supplied caller ID. The outbound identity is owned
    // and selected by Flowtix platform infrastructure.
    const callerId = await resolvePlatformManagedCallerId(
      organization.organization_id,
    )
    const fromNumber = callerId.phoneNumber

    const admin = createTelephonyAdminClient()

    if (contactId) {
      let contactQuery = admin
        .from('contacts')
        .select('id,owner_membership_id')
        .eq('id', contactId)
        .eq('organization_id', organization.organization_id)

      if (organization.role === 'agent') {
        contactQuery = contactQuery.eq(
          'owner_membership_id',
          organization.membership_id,
        )
      }

      const { data: contact, error: contactError } =
        await contactQuery.maybeSingle()

      if (contactError) throw new Error(contactError.message)
      if (!contact) {
        return NextResponse.json(
          {
            error:
              'The selected contact is unavailable or is not assigned to you.',
          },
          { status: 403 },
        )
      }
    }

    const { data: existing, error: existingError } = await admin
      .from('calls')
      .select('id,organization_id,created_by,to_number,from_number')
      .eq('provider', provider)
      .eq('provider_call_sid', providerCallId)
      .maybeSingle()

    if (existingError) throw new Error(existingError.message)
    if (existing) {
      if (
        existing.organization_id !== organization.organization_id ||
        existing.created_by !== userId ||
        existing.to_number !== toNumber ||
        existing.from_number !== fromNumber
      ) {
        return NextResponse.json(
          { error: 'Browser call identifier conflict.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ callId: existing.id, replay: true })
    }

    const { data: inserted, error: insertError } = await admin
      .from('calls')
      .insert({
        organization_id: organization.organization_id,
        contact_id: contactId,
        direction: 'outbound',
        status: 'initiating',
        started_at: new Date().toISOString(),
        recording_available: false,
        created_by: userId,
        provider,
        provider_call_sid: providerCallId,
        from_number: fromNumber,
        to_number: toNumber,
        metadata: {
          source: 'browser_dialer',
          caller_id_source: 'flowtix_platform',
        },
      })
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: raced } = await admin
          .from('calls')
          .select('id')
          .eq('organization_id', organization.organization_id)
          .eq('provider', provider)
          .eq('provider_call_sid', providerCallId)
          .maybeSingle()
        if (raced?.id) {
          return NextResponse.json({ callId: raced.id, replay: true })
        }
      }
      throw new Error(
        `Unable to create browser call record: ${insertError.message}`,
      )
    }

    return NextResponse.json({ callId: inserted.id, replay: false })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to register browser call.',
      },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

import { NextResponse } from 'next/server'

import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { hasPermission } from '@/lib/permissions'
import { writeAuditEvent } from '@/lib/security/audit'
import { createClient } from '@/lib/supabase/server'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { isMoceanManagedOutboundConfigured, normalizeE164 } from '@/lib/telephony/mocean'
import { getCurrentOrganization } from '@/lib/team'

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
      return NextResponse.json({ error: 'You do not have permission to place calls.' }, { status: 403 })
    }
    await assertEntitlement('dialer.cloud', current.organization.organization_id)

    const admin = createTelephonyAdminClient()
    const { data, error } = await admin
      .from('telephony_agent_settings')
      .select('callback_number,updated_at')
      .eq('organization_id', current.organization.organization_id)
      .eq('user_id', current.userId)
      .maybeSingle()
    if (error) throw new Error(error.message)

    return NextResponse.json({
      managed: isMoceanManagedOutboundConfigured(),
      callbackNumber: data?.callback_number ?? '',
      updatedAt: data?.updated_at ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load managed calling settings.' },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

export async function PUT(request: Request) {
  try {
    const current = await context()
    if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasPermission(current.organization.role, 'calls.create')) {
      return NextResponse.json({ error: 'You do not have permission to place calls.' }, { status: 403 })
    }
    await assertEntitlement('dialer.cloud', current.organization.organization_id)

    const body = await request.json() as Record<string, unknown>
    const callbackNumber = normalizeE164(typeof body.callbackNumber === 'string' ? body.callbackNumber : '')
    const admin = createTelephonyAdminClient()
    const { error } = await admin.from('telephony_agent_settings').upsert({
      organization_id: current.organization.organization_id,
      user_id: current.userId,
      callback_number: callbackNumber,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,user_id' })
    if (error) throw new Error(`Unable to save callback number: ${error.message}`)

    await writeAuditEvent({
      action: 'telephony.mocean.callback_number.updated',
      resourceType: 'telephony_agent_setting',
      organizationId: current.organization.organization_id,
      targetUserId: current.userId,
      metadata: { provider: 'mocean', callbackLast4: callbackNumber.slice(-4) },
    })

    return NextResponse.json({ callbackNumber })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save managed calling settings.' },
      { status: isEntitlementError(error) ? 403 : 400 },
    )
  }
}

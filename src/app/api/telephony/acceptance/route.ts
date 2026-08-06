import { NextResponse } from 'next/server'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { hasPermission } from '@/lib/permissions'
import { runTelephonyAcceptanceValidation } from '@/lib/telephony/acceptance'
import { getCurrentOrganization } from '@/lib/team'

export const dynamic = 'force-dynamic'

export async function GET() {
  const organization = await getCurrentOrganization()
  if (!organization) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  if (!hasPermission(organization.role, 'calls.view_all')) {
    return NextResponse.json({ error: 'Telephony acceptance validation requires manager access.' }, { status: 403 })
  }

  try {
    await assertEntitlement('dialer.cloud', organization.organization_id)
    const report = await runTelephonyAcceptanceValidation(organization.organization_id)
    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  } catch (error) {
    const status = isEntitlementError(error) ? 403 : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to validate telephony readiness.' },
      { status },
    )
  }
}

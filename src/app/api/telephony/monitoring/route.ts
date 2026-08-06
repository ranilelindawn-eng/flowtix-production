import { NextResponse } from 'next/server'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { hasPermission } from '@/lib/permissions'
import { acknowledgeTelephonyAlert, collectTelephonyMonitoringSnapshot, getTelephonyMonitoringOverview } from '@/lib/telephony/monitoring/service'
import { getCurrentOrganization } from '@/lib/team'

export const dynamic = 'force-dynamic'
type MonitoringRequest = { action?: 'collect' | 'acknowledge'; alertId?: string }

async function authorize() {
  const organization = await getCurrentOrganization()
  if (!organization) return { response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) }
  if (!hasPermission(organization.role, 'calls.view_all')) return { response: NextResponse.json({ error: 'Telephony monitoring requires manager access.' }, { status: 403 }) }
  try {
    await assertEntitlement('dialer.cloud', organization.organization_id)
  } catch (error) {
    return { response: NextResponse.json({ error: error instanceof Error ? error.message : 'Calling is unavailable.' }, { status: isEntitlementError(error) ? 403 : 500 }) }
  }
  return { organization }
}

export async function GET() {
  const access = await authorize()
  if ('response' in access) return access.response
  return NextResponse.json(await getTelephonyMonitoringOverview(access.organization.organization_id))
}

export async function POST(request: Request) {
  const access = await authorize()
  if ('response' in access) return access.response
  const body = (await request.json().catch(() => ({}))) as MonitoringRequest
  if (body.action === 'collect') {
    const snapshotId = await collectTelephonyMonitoringSnapshot(access.organization.organization_id)
    return NextResponse.json({ collected: true, snapshotId })
  }
  if (body.action === 'acknowledge' && typeof body.alertId === 'string' && body.alertId.trim()) {
    const acknowledged = await acknowledgeTelephonyAlert({
      organizationId: access.organization.organization_id,
      alertId: body.alertId.trim(),
      userId: access.organization.user_id,
    })
    return NextResponse.json({ acknowledged }, { status: acknowledged ? 200 : 409 })
  }
  return NextResponse.json({ error: 'Invalid monitoring request.' }, { status: 400 })
}

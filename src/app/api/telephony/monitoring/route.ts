import { NextResponse } from 'next/server'
import { acknowledgeTelephonyAlert, collectTelephonyMonitoringSnapshot, getTelephonyMonitoringOverview } from '@/lib/telephony/monitoring/service'
import { getCurrentOrganization } from '@/lib/team'

export const dynamic = 'force-dynamic'

type MonitoringRequest = { action?: 'collect' | 'acknowledge'; alertId?: string }

export async function GET() {
  const organization = await getCurrentOrganization()
  if (!organization) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  const overview = await getTelephonyMonitoringOverview(organization.organization_id)
  return NextResponse.json(overview)
}

export async function POST(request: Request) {
  const organization = await getCurrentOrganization()
  if (!organization) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  const body = (await request.json()) as MonitoringRequest
  if (body.action === 'collect') {
    const snapshotId = await collectTelephonyMonitoringSnapshot(organization.organization_id)
    return NextResponse.json({ collected: true, snapshotId })
  }
  if (body.action === 'acknowledge' && typeof body.alertId === 'string') {
    const acknowledged = await acknowledgeTelephonyAlert({
      organizationId: organization.organization_id, alertId: body.alertId, userId: organization.user_id,
    })
    return NextResponse.json({ acknowledged }, { status: acknowledged ? 200 : 409 })
  }
  return NextResponse.json({ error: 'Invalid monitoring request.' }, { status: 400 })
}

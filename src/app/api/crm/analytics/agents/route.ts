import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { collectAgentAnalyticsSnapshot, getAgentAnalyticsOverview, normalizeAgentAnalyticsPeriod } from '@/lib/analytics/agents'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const period = normalizeAgentAnalyticsPeriod(url.searchParams.get('period') ?? undefined)
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement('analytics.agents', organization.organization_id)

    return NextResponse.json(await getAgentAnalyticsOverview(period))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load agent analytics.' }, { status: isEntitlementError(error) ? 403 : 500 })
  }
}

export async function POST(request: Request) {
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement('analytics.agents', organization.organization_id)

    const body = (await request.json().catch(() => ({}))) as { period?: string }
    const period = normalizeAgentAnalyticsPeriod(body.period)
    return NextResponse.json({ snapshot: await collectAgentAnalyticsSnapshot(period) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to collect agent analytics.' }, { status: isEntitlementError(error) ? 403 : 500 })
  }
}

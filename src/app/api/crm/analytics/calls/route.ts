import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { collectCallAnalyticsSnapshot, getCallAnalyticsOverview, normalizeCallAnalyticsPeriod } from '@/lib/analytics/calls'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const period = normalizeCallAnalyticsPeriod(url.searchParams.get('period') ?? undefined)
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement('analytics.calls', organization.organization_id)

    return NextResponse.json(await getCallAnalyticsOverview(period))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load call analytics.' }, { status: isEntitlementError(error) ? 403 : 500 })
  }
}

export async function POST(request: Request) {
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement('analytics.calls', organization.organization_id)

    const body = (await request.json().catch(() => ({}))) as { period?: string }
    const period = normalizeCallAnalyticsPeriod(body.period)
    return NextResponse.json({ snapshot: await collectCallAnalyticsSnapshot(period) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to collect call analytics.' }, { status: isEntitlementError(error) ? 403 : 500 })
  }
}

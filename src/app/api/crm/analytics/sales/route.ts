import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { collectSalesAnalyticsSnapshot, getSalesAnalyticsOverview, normalizeSalesAnalyticsPeriod } from '@/lib/analytics/sales'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const period = normalizeSalesAnalyticsPeriod(url.searchParams.get('period') ?? undefined)
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement('analytics.sales', organization.organization_id)

    return NextResponse.json(await getSalesAnalyticsOverview(period))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load sales analytics.' }, { status: isEntitlementError(error) ? 403 : 500 })
  }
}

export async function POST(request: Request) {
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement('analytics.sales', organization.organization_id)

    const body = (await request.json().catch(() => ({}))) as { period?: string }
    const period = normalizeSalesAnalyticsPeriod(body.period)
    return NextResponse.json({ snapshot: await collectSalesAnalyticsSnapshot(period) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to collect sales analytics.' }, { status: isEntitlementError(error) ? 403 : 500 })
  }
}

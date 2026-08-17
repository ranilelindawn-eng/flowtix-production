import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { collectCampaignAnalyticsSnapshot, getCampaignAnalyticsOverview, normalizeCampaignAnalyticsPeriod } from '@/lib/analytics/campaigns'

export async function GET(request: Request) {
  const period = normalizeCampaignAnalyticsPeriod(new URL(request.url).searchParams.get('period') ?? undefined)
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement('analytics.campaigns', organization.organization_id)
 return NextResponse.json(await getCampaignAnalyticsOverview(period)) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load campaign analytics.' }, { status: isEntitlementError(error) ? 403 : 500 }) }
}

export async function POST(request: Request) {
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement('analytics.campaigns', organization.organization_id)

    const body = (await request.json().catch(() => ({}))) as { period?: string }
    return NextResponse.json({ snapshot: await collectCampaignAnalyticsSnapshot(normalizeCampaignAnalyticsPeriod(body.period)) }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to collect campaign analytics.' }, { status: isEntitlementError(error) ? 403 : 500 }) }
}

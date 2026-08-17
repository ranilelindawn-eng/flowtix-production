import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import {
  collectAIAnalyticsSnapshot,
  getAIAnalyticsOverview,
  normalizeAIAnalyticsPeriod,
} from '@/lib/analytics/ai'

export async function GET(request: Request) {
  const period = normalizeAIAnalyticsPeriod(
    new URL(request.url).searchParams.get('period') ?? undefined,
  )

  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement(
      'analytics.ai',
      organization.organization_id,
    )

    return NextResponse.json(
      await getAIAnalyticsOverview(period),
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load AI analytics.',
      },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement(
      'analytics.ai',
      organization.organization_id,
    )

    const body = (await request
      .json()
      .catch(() => ({}))) as { period?: string }

    return NextResponse.json(
      {
        snapshot: await collectAIAnalyticsSnapshot(
          normalizeAIAnalyticsPeriod(body.period),
        ),
      },
      { status: 201 },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to collect AI analytics.',
      },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

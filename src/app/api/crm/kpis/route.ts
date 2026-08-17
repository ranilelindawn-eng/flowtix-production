import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import {
  collectKpiSnapshot,
  getKpiOverview,
  type KpiPeriod,
} from '@/lib/kpis'

function period(value: string | null): KpiPeriod {
  return value === '7d' ||
    value === '90d' ||
    value === '365d'
    ? value
    : '30d'
}

export async function GET(request: Request) {
  const url = new URL(request.url)

  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement(
      'analytics.kpi',
      organization.organization_id,
    )

    return NextResponse.json(
      await getKpiOverview(
        period(url.searchParams.get('period')),
      ),
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load KPIs.',
      },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const requested =
    typeof body === 'object' &&
    body !== null &&
    'period' in body
      ? String(body.period)
      : null

  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement(
      'analytics.kpi',
      organization.organization_id,
    )

    return NextResponse.json(
      {
        snapshot: await collectKpiSnapshot(
          period(requested),
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
            : 'Unable to collect KPIs.',
      },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth'
import { createDashboard, listDashboards } from '@/lib/dashboards'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'

export async function GET() {
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement(
      'analytics.dashboards',
      organization.organization_id,
    )

    return NextResponse.json({
      dashboards: await listDashboards(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load dashboards',
      },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement(
      'analytics.dashboards',
      organization.organization_id,
    )

    const body = await request.json()

    if (!body?.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { dashboard: await createDashboard(body) },
      { status: 201 },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to create dashboard',
      },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

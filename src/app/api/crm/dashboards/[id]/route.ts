import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth'
import { deleteDashboard, updateDashboard } from '@/lib/dashboards'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'

type Context = {
  params: Promise<{ id: string }>
}

export async function PATCH(
  request: Request,
  { params }: Context,
) {
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement(
      'analytics.dashboards',
      organization.organization_id,
    )

    const { id } = await params

    return NextResponse.json({
      dashboard: await updateDashboard(
        id,
        await request.json(),
      ),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to update dashboard',
      },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: Context,
) {
  try {
    const organization = await requirePermission('reports.view')
    await assertEntitlement(
      'analytics.dashboards',
      organization.organization_id,
    )

    const { id } = await params
    await deleteDashboard(id)

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to delete dashboard',
      },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

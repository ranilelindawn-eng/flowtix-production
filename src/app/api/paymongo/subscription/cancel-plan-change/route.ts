import { NextResponse } from 'next/server'

import { getBillingAppUrl } from '@/lib/billing/config'
import { cancelScheduledPlanChange } from '@/lib/billing/platform'
import { writeAuditEvent } from '@/lib/security/audit'
import { getCurrentOrganization } from '@/lib/team'

function redirect(path: string) {
  return NextResponse.redirect(new URL(path, getBillingAppUrl()), 303)
}

export async function POST() {
  const organization = await getCurrentOrganization()

  if (!organization) {
    return redirect('/login')
  }

  try {
    const result = await cancelScheduledPlanChange()

    await writeAuditEvent({
      action: 'billing.subscription.plan_change_cancelled',
      organizationId: organization.organization_id,
      resourceType: 'organization_subscription',
      metadata:
        typeof result === 'object' && result !== null
          ? result
          : { result },
    })

    return redirect(
      '/dashboard/billing?subscription=plan_change_cancelled',
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to cancel the scheduled plan change.'

    return NextResponse.json(
      { error: message },
      {
        status: message.includes('Only the workspace owner')
          ? 403
          : 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  }
}

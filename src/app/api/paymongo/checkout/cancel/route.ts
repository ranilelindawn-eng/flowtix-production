import { NextResponse } from 'next/server'

import { getBillingAppUrl } from '@/lib/billing/config'
import { cancelPendingCheckout } from '@/lib/billing/lifecycle'
import { writeAuditEvent } from '@/lib/security/audit'
import { getCurrentOrganization } from '@/lib/team'

function redirect(path: string) {
  return NextResponse.redirect(
    new URL(path, getBillingAppUrl()),
    303,
  )
}

export async function POST() {
  const organization = await getCurrentOrganization()

  if (!organization) {
    return redirect('/login')
  }

  try {
    const result = await cancelPendingCheckout()

    await writeAuditEvent({
      action: 'billing.paymongo.checkout.cancelled',
      organizationId: organization.organization_id,
      resourceType: 'organization_subscription',
      metadata:
        typeof result === 'object' &&
        result !== null
          ? result
          : { result },
    })

    return redirect(
      '/dashboard/billing?checkout=cancelled',
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to cancel the pending checkout.'

    await writeAuditEvent({
      action: 'billing.paymongo.checkout.cancel_failed',
      organizationId: organization.organization_id,
      resourceType: 'organization_subscription',
      outcome: 'failure',
      metadata: { error: message },
    })

    return NextResponse.json(
      { error: message },
      {
        status: message.includes(
          'Only the workspace owner',
        )
          ? 403
          : 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  }
}
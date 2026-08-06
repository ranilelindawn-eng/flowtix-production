import { NextResponse } from 'next/server'

import { getBillingAppUrl } from '@/lib/billing/config'
import { requestSubscriptionCancellation } from '@/lib/billing/lifecycle'
import { writeAuditEvent } from '@/lib/security/audit'
import { getCurrentOrganization } from '@/lib/team'

function redirect(path: string) {
  return NextResponse.redirect(new URL(path, getBillingAppUrl()), 303)
}

export async function POST() {
  const organization = await getCurrentOrganization()
  if (!organization) return redirect('/login')

  try {
    const result = await requestSubscriptionCancellation()
    await writeAuditEvent({
      action: 'billing.subscription.cancellation_scheduled',
      organizationId: organization.organization_id,
      resourceType: 'organization_subscription',
      metadata: result,
    })
    return redirect('/dashboard/billing?subscription=cancel_scheduled')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cancellation failed.'
    return NextResponse.json(
      { error: message },
      { status: message.includes('Only the workspace owner') ? 403 : 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

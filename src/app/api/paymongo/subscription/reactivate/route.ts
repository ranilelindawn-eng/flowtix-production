import { NextResponse } from 'next/server'

import { getBillingAppUrl } from '@/lib/billing/config'
import { reactivateSubscription } from '@/lib/billing/lifecycle'
import { writeAuditEvent } from '@/lib/security/audit'
import { getCurrentOrganization } from '@/lib/team'

function redirect(path: string) {
  return NextResponse.redirect(new URL(path, getBillingAppUrl()), 303)
}

export async function POST() {
  const organization = await getCurrentOrganization()
  if (!organization) return redirect('/login')

  try {
    const result = await reactivateSubscription()
    await writeAuditEvent({
      action: 'billing.subscription.reactivated',
      organizationId: organization.organization_id,
      resourceType: 'organization_subscription',
      metadata: result,
    })
    return redirect('/dashboard/billing?subscription=reactivated')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reactivation failed.'
    return NextResponse.json(
      { error: message },
      { status: message.includes('Only the workspace owner') ? 403 : 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

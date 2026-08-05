import { NextResponse } from 'next/server'
import { reactivateSubscription } from '@/lib/billing/lifecycle'
import { writeAuditEvent } from '@/lib/security/audit'
import { getCurrentOrganization } from '@/lib/team'

export async function POST() {
  const organization = await getCurrentOrganization()
  try {
    const result = await reactivateSubscription()
    if (organization) {
      await writeAuditEvent({
        action: 'billing.subscription.reactivated',
        organizationId: organization.organization_id,
        resourceType: 'organization_subscription',
        metadata: result,
      })
    }
    return NextResponse.redirect(new URL('/dashboard/billing?subscription=reactivated', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'), 303)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Reactivation failed.' }, { status: 400 })
  }
}

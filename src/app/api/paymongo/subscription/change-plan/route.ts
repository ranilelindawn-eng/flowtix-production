import { NextResponse } from 'next/server'

import { schedulePlanChange } from '@/lib/billing/platform'
import { getPayMongoPlan } from '@/lib/paymongo/plans'
import { writeAuditEvent } from '@/lib/security/audit'
import { getCurrentOrganization } from '@/lib/team'

export async function POST(request: Request) {
  const organization = await getCurrentOrganization()
  try {
    const form = await request.formData()
    const planCode = form.get('plan')?.toString() ?? ''
    const effective = form.get('effective') === 'immediate' ? 'immediate' : 'period_end'
    if (!getPayMongoPlan(planCode)) {
      return NextResponse.json({ error: 'Invalid plan selected.' }, { status: 400 })
    }
    await schedulePlanChange(planCode, effective)
    if (organization) {
      await writeAuditEvent({
        action: 'billing.subscription.plan_change_scheduled',
        organizationId: organization.organization_id,
        resourceType: 'organization_subscription',
        metadata: { plan_code: planCode, effective },
      })
    }
    return NextResponse.redirect(new URL('/dashboard/billing?subscription=plan_scheduled', request.url), 303)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Plan change failed.' }, { status: 400 })
  }
}

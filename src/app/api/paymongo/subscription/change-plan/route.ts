import { NextResponse } from 'next/server'

import { getBillingAppUrl } from '@/lib/billing/config'
import { schedulePlanChange } from '@/lib/billing/platform'
import { getPayMongoPlan } from '@/lib/paymongo/plans'
import { writeAuditEvent } from '@/lib/security/audit'
import { getCurrentOrganization } from '@/lib/team'

function redirect(path: string) {
  return NextResponse.redirect(new URL(path, getBillingAppUrl()), 303)
}

export async function POST(request: Request) {
  const organization = await getCurrentOrganization()
  if (!organization) return redirect('/login')

  try {
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.includes('application/x-www-form-urlencoded') && !contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'A valid billing form submission is required.' },
        { status: 415, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const form = await request.formData()
    const planCode = form.get('plan')?.toString().trim().toLowerCase() ?? ''
    const requestedEffective = form.get('effective')?.toString().trim().toLowerCase() ?? 'period_end'

    if (requestedEffective !== 'period_end') {
      return NextResponse.json(
        { error: 'Paid plan changes take effect at the end of the current billing period.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const plan = await getPayMongoPlan(planCode)
    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan selected.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const result = await schedulePlanChange(plan.code, 'period_end')
    await writeAuditEvent({
      action: 'billing.subscription.plan_change_scheduled',
      organizationId: organization.organization_id,
      resourceType: 'organization_subscription',
      metadata: { plan_code: plan.code, effective: 'period_end', result },
    })

    return redirect('/dashboard/billing?subscription=plan_scheduled')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Plan change failed.'
    return NextResponse.json(
      { error: message },
      { status: message.includes('Only the workspace owner') ? 403 : 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

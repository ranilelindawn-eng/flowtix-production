import { NextResponse } from 'next/server'

import {
  beginIdempotentOperation,
  completeIdempotentOperation,
  failIdempotentOperation,
  idempotencyErrorStatus,
  type IdempotencyHandle,
} from '@/lib/idempotency'
import {
  createPayMongoCheckoutSession,
  PayMongoApiError,
} from '@/lib/paymongo/client'
import { getPayMongoPlan } from '@/lib/paymongo/plans'
import { writeAuditEvent } from '@/lib/security/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentOrganization } from '@/lib/team'

const getAppUrl = () => {
  const url =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim()

  return (url || 'http://localhost:3000').replace(/\/$/, '')
}

export async function POST(request: Request) {
  let idempotency: IdempotencyHandle | null = null
  let organizationId: string | null = null

  try {
    const organization = await getCurrentOrganization()

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found.' },
        { status: 401 },
      )
    }

    organizationId = organization.organization_id

    if (organization.role !== 'owner') {
      await writeAuditEvent({
        action: 'billing.paymongo.checkout.denied',
        organizationId,
        resourceType: 'organization_subscription',
        outcome: 'denied',
        metadata: { reason: 'owner_required' },
      })

      return NextResponse.json(
        { error: 'Only the workspace owner can change plans.' },
        { status: 403 },
      )
    }

    const formData = await request.formData()
    const selectedPlan = formData.get('plan')?.toString() ?? ''
    const plan = getPayMongoPlan(selectedPlan)

    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan selected.' },
        { status: 400 },
      )
    }

    idempotency = await beginIdempotentOperation({
      organizationId,
      scope: 'billing.paymongo.checkout',
      payload: { planCode: plan.code, amount: plan.amount },
      key: formData.get('idempotency_key')?.toString() || null,
      ttlSeconds: 3_600,
      fallbackWindowSeconds: 600,
    })

    if (idempotency.replay) {
      const checkoutUrl = idempotency.replay.body.checkoutUrl
      if (typeof checkoutUrl === 'string' && checkoutUrl) {
        return NextResponse.redirect(checkoutUrl, 303)
      }
      return NextResponse.json(idempotency.replay.body, {
        status: idempotency.replay.status,
      })
    }

    const appUrl = getAppUrl()
    const { checkoutId, checkoutUrl } =
      await createPayMongoCheckoutSession({
        amount: plan.amount,
        name: plan.name,
        description: `${plan.name} monthly subscription`,
        metadata: {
          organization_id: organizationId,
          plan_code: plan.code,
          billing_provider: 'paymongo',
        },
        successUrl: `${appUrl}/dashboard?payment=success`,
        cancelUrl: `${appUrl}/dashboard/billing?checkout=cancelled`,
      })

    const admin = createAdminClient()
    const { data: targetPlan, error: planError } = await admin
      .from('subscription_plans')
      .select('id')
      .eq('code', plan.code)
      .eq('is_active', true)
      .maybeSingle()

    if (planError || !targetPlan) {
      throw new Error(planError?.message ?? 'Subscription plan was not found.')
    }

    const checkoutExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { data: updatedSubscription, error: updateError } = await admin
      .from('organization_subscriptions')
      .update({
        billing_provider: 'paymongo',
        paymongo_checkout_id: checkoutId,
        paymongo_plan_code: plan.code,
        paymongo_payment_id: null,
        provider_checkout_id: checkoutId,
        provider_payment_id: null,
        pending_plan_id: targetPlan.id,
        pending_checkout_expires_at: checkoutExpiresAt,
        last_payment_status: 'pending',
        status: 'pending',
        billing_metadata: {
          checkout_created_at: new Date().toISOString(),
          requested_plan_code: plan.code,
          checkout_expires_at: checkoutExpiresAt,
        },
      })
      .eq('organization_id', organizationId)
      .select('id')
      .maybeSingle()

    if (updateError || !updatedSubscription) {
      throw new Error(
        updateError?.message ?? 'Subscription record was not updated.',
      )
    }

    await admin.from('billing_payments').insert({
      organization_id: organizationId,
      subscription_id: updatedSubscription.id,
      provider: 'paymongo',
      provider_checkout_id: checkoutId,
      plan_id: targetPlan.id,
      plan_code: plan.code,
      status: 'pending',
      amount: plan.amount,
      currency: 'PHP',
      metadata: { checkout_expires_at: checkoutExpiresAt },
    })

    await completeIdempotentOperation(
      idempotency,
      303,
      { checkoutUrl, checkoutId, planCode: plan.code },
      { type: 'paymongo_checkout', id: checkoutId },
    )

    await writeAuditEvent({
      action: 'billing.paymongo.checkout.created',
      organizationId,
      resourceType: 'organization_subscription',
      resourceId: updatedSubscription.id,
      metadata: {
        checkout_id: checkoutId,
        plan_code: plan.code,
        amount: plan.amount,
        currency: 'PHP',
      },
    })

    return NextResponse.redirect(checkoutUrl, 303)
  } catch (error) {
    const status =
      error instanceof PayMongoApiError
        ? Math.max(400, Math.min(error.status, 599))
        : idempotencyErrorStatus(error) ?? 500

    await failIdempotentOperation(idempotency, error, status)

    if (organizationId) {
      await writeAuditEvent({
        action: 'billing.paymongo.checkout.failed',
        organizationId,
        resourceType: 'organization_subscription',
        outcome: 'failure',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          provider_status:
            error instanceof PayMongoApiError ? error.status : null,
        },
      })
    }

    console.error('PAYMONGO CHECKOUT ERROR:', error)

    return NextResponse.json(
      {
        error:
          error instanceof PayMongoApiError
            ? 'PayMongo checkout could not be created.'
            : error instanceof Error
              ? error.message
              : 'Server error.',
      },
      { status },
    )
  }
}

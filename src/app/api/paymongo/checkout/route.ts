import { NextResponse } from 'next/server'

import { getBillingAppUrl } from '@/lib/billing/config'
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

type CheckoutCreationLease = {
  subscription_id?: string
  creation_token?: string
}

type CheckoutRegistration = {
  subscription_id?: string
  payment_id?: string
}

export async function POST(request: Request) {
  let idempotency: IdempotencyHandle | null = null
  let organizationId: string | null = null
  let creationToken: string | null = null

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
    const plan = await getPayMongoPlan(selectedPlan)

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

    const admin = createAdminClient()
    const { data: lease, error: leaseError } = await admin.rpc(
      'begin_paymongo_checkout_creation',
      {
        p_organization_id: organizationId,
        p_plan_id: plan.id,
        p_plan_code: plan.code,
        p_amount: plan.amount,
        p_currency: 'PHP',
      },
    )

    if (leaseError) {
      throw new Error(`Unable to reserve PayMongo checkout creation: ${leaseError.message}`)
    }

    const leaseResult = lease as CheckoutCreationLease | null
    if (!leaseResult?.subscription_id || !leaseResult.creation_token) {
      throw new Error('PayMongo checkout reservation returned an invalid result.')
    }
    creationToken = leaseResult.creation_token

    const appUrl = getBillingAppUrl()
    const { checkoutId, checkoutUrl } = await createPayMongoCheckoutSession({
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

    const checkoutExpiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString()
    const { data: registration, error: registrationError } = await admin.rpc(
      'finalize_paymongo_checkout_creation',
      {
        p_organization_id: organizationId,
        p_creation_token: creationToken,
        p_checkout_id: checkoutId,
        p_plan_id: plan.id,
        p_plan_code: plan.code,
        p_amount: plan.amount,
        p_currency: 'PHP',
        p_expires_at: checkoutExpiresAt,
      },
    )

    if (registrationError) {
      throw new Error(
        `Unable to finalize PayMongo checkout: ${registrationError.message}`,
      )
    }

    const registrationResult = registration as CheckoutRegistration | null
    if (!registrationResult?.subscription_id || !registrationResult.payment_id) {
      throw new Error('PayMongo checkout finalization returned an invalid result.')
    }
    creationToken = null

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
      resourceId: registrationResult.subscription_id,
      metadata: {
        checkout_id: checkoutId,
        payment_id: registrationResult.payment_id,
        plan_code: plan.code,
        amount: plan.amount,
        currency: 'PHP',
      },
    })

    return NextResponse.redirect(checkoutUrl, 303)
  } catch (error) {
    if (organizationId && creationToken) {
      try {
        const admin = createAdminClient()
        await admin.rpc('abandon_paymongo_checkout_creation', {
          p_organization_id: organizationId,
          p_creation_token: creationToken,
          p_reason:
            error instanceof Error ? error.message : 'Unknown checkout error',
        })
      } catch (cleanupError) {
        console.error('PAYMONGO CHECKOUT LEASE CLEANUP ERROR:', cleanupError)
      }
    }

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

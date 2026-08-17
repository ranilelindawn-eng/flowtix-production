import { NextResponse } from 'next/server'

import { getCurrentSubscription } from '@/lib/billing'
import { getBillingAppUrl } from '@/lib/billing/config'
import {
  convertUsdCentsToPhpCentavos,
  FxReferenceRateError,
  getUsdPhpReferenceQuote,
} from '@/lib/billing/fx'
import { schedulePlanChange } from '@/lib/billing/platform'
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

type TrialPlanSwitchResult = {
  applied?: boolean
  changed?: boolean
  subscription_id?: string
  plan_id?: string
  plan_code?: string
  trial_ends_at?: string
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

    const currentSubscription = await getCurrentSubscription()
    const currentPlanCode =
      currentSubscription?.plan?.code ??
      currentSubscription?.paymongo_plan_code

    if (plan.code === 'enterprise') {
      await writeAuditEvent({
        action: 'billing.paymongo.checkout.denied',
        organizationId,
        resourceType: 'organization_subscription',
        resourceId: currentSubscription?.id ?? undefined,
        outcome: 'denied',
        metadata: {
          reason: 'enterprise_assisted_onboarding_required',
          requested_plan_code: plan.code,
          current_plan_code: currentPlanCode ?? null,
        },
      })

      return NextResponse.json(
        {
          error:
            'Enterprise billing is managed through assisted onboarding. Contact Flowtix for activation, renewal, or custom-limit changes.',
        },
        { status: 400 },
      )
    }

    const admin = createAdminClient()

    const {
      data: trialSwitch,
      error: trialSwitchError,
    } = await admin.rpc(
      'switch_flowtix_trial_plan_if_active',
      {
        p_organization_id: organizationId,
        p_plan_id: plan.id,
        p_plan_code: plan.code,
      },
    )

    if (trialSwitchError) {
      throw new Error(
        `Unable to change the trial plan: ${trialSwitchError.message}`,
      )
    }

    const trialSwitchResult =
      trialSwitch as TrialPlanSwitchResult | null

    if (trialSwitchResult?.applied) {
      await writeAuditEvent({
        action: 'billing.trial.plan_changed',
        organizationId,
        resourceType: 'organization_subscription',
        resourceId:
          trialSwitchResult.subscription_id ?? undefined,
        metadata: {
          plan_code: plan.code,
          plan_id: plan.id,
          changed: trialSwitchResult.changed === true,
          trial_ends_at:
            trialSwitchResult.trial_ends_at ?? null,
          charged: false,
        },
      })

      const appUrl = getBillingAppUrl()

      return NextResponse.redirect(
        `${appUrl}/dashboard/billing?trial=plan-changed`,
        303,
      )
    }

    const activePaidPeriod =
      currentSubscription?.status === 'active' &&
      currentSubscription.current_period_end !== null &&
      Date.parse(currentSubscription.current_period_end) > Date.now() &&
      currentSubscription.plan !== null

    if (activePaidPeriod && currentSubscription?.plan) {
      if (currentSubscription.cancel_at_period_end) {
        throw new Error(
          'Reactivate the subscription before changing plans.',
        )
      }

      if (currentSubscription.plan.id === plan.id) {
        throw new Error(
          'The subscription already uses this plan.',
        )
      }

      if (plan.sortOrder < currentSubscription.plan.sort_order) {
        const result = await schedulePlanChange(
          plan.code,
          'period_end',
        )

        await writeAuditEvent({
          action: 'billing.subscription.plan_change_scheduled',
          organizationId,
          resourceType: 'organization_subscription',
          resourceId: currentSubscription.id,
          metadata: {
            plan_code: plan.code,
            plan_id: plan.id,
            effective: 'period_end',
            charged: false,
            result,
          },
        })

        const appUrl = getBillingAppUrl()

        return NextResponse.redirect(
          `${appUrl}/dashboard/billing?subscription=plan_scheduled`,
          303,
        )
      }
    }

    const fxQuote = await getUsdPhpReferenceQuote()
    const checkoutAmount = convertUsdCentsToPhpCentavos(
      plan.publicPriceUsdCents,
      fxQuote.rate,
    )

    idempotency = await beginIdempotentOperation({
      organizationId,
      scope: 'billing.paymongo.checkout',
      payload: {
        planCode: plan.code,
        sourceCurrency: 'USD',
        sourceAmountCents: plan.publicPriceUsdCents,
        settlementCurrency: 'PHP',
        settlementAmountCentavos: checkoutAmount,
        fxRate: fxQuote.rate,
        fxRateDate: fxQuote.rateDate,
        fxProvider: fxQuote.provider,
      },
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

    const { data: lease, error: leaseError } = await admin.rpc(
      'begin_paymongo_fx_checkout_creation',
      {
        p_organization_id: organizationId,
        p_plan_id: plan.id,
        p_plan_code: plan.code,
        p_amount: checkoutAmount,
        p_currency: 'PHP',
        p_source_usd_cents: plan.publicPriceUsdCents,
        p_fx_rate: fxQuote.rate,
        p_fx_rate_date: fxQuote.rateDate,
        p_fx_provider: fxQuote.provider,
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
      amount: checkoutAmount,
      name: plan.name,
      description: `${plan.name} monthly subscription`,
      metadata: {
        organization_id: organizationId,
        plan_code: plan.code,
        billing_provider: 'paymongo',
        source_currency: 'USD',
        source_amount_cents: String(plan.publicPriceUsdCents),
        settlement_currency: 'PHP',
        settlement_amount_centavos: String(checkoutAmount),
        fx_rate: String(fxQuote.rate),
        fx_rate_date: fxQuote.rateDate,
        fx_provider: fxQuote.provider,
      },
      successUrl: `${appUrl}/dashboard/billing?checkout=success`,
      cancelUrl: `${appUrl}/dashboard/billing?checkout=cancelled`,
    })

    const checkoutExpiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString()
    const { data: registration, error: registrationError } = await admin.rpc(
      'finalize_paymongo_fx_checkout_creation',
      {
        p_organization_id: organizationId,
        p_creation_token: creationToken,
        p_checkout_id: checkoutId,
        p_plan_id: plan.id,
        p_plan_code: plan.code,
        p_amount: checkoutAmount,
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
        amount: checkoutAmount,
        currency: 'PHP',
        source_currency: 'USD',
        source_amount_cents: plan.publicPriceUsdCents,
        fx_rate: fxQuote.rate,
        fx_rate_date: fxQuote.rateDate,
        fx_provider: fxQuote.provider,
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
        : error instanceof FxReferenceRateError
          ? 503
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
            : error instanceof FxReferenceRateError
              ? 'The current USD to PHP conversion rate is temporarily unavailable. Please try checkout again shortly.'
              : error instanceof Error
                ? error.message
                : 'Server error.',
      },
      { status },
    )
  }
}

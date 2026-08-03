import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

type PayMongoResource = {
  id?: string
  type?: string
  attributes?: {
    metadata?: {
      organization_id?: string
      plan_code?: string
    }
    payments?: Array<{
      id?: string
    }>
    payment_intent?: {
      attributes?: {
        payments?: Array<{
          id?: string
        }>
      }
    }
  }
}

type PayMongoWebhookBody = {
  data?: {
    id?: string
    type?: string
    attributes?: {
      type?: string
      data?: PayMongoResource
    }
  }
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as PayMongoWebhookBody

    const eventType =
      body.data?.attributes?.type

    /*
     * PayMongo may send other subscribed event types.
     * Always acknowledge events that this route does not process.
     */
    if (
      eventType !==
      'checkout_session.payment.paid'
    ) {
      return NextResponse.json({
        received: true,
        ignored: eventType ?? 'unknown',
      })
    }

    const checkoutSession =
      body.data?.attributes?.data

    const checkoutId =
      checkoutSession?.id ?? null

    const checkoutAttributes =
      checkoutSession?.attributes

    const metadata =
      checkoutAttributes?.metadata

    const organizationId =
      metadata?.organization_id?.trim() ?? ''

    const planCode =
      metadata?.plan_code?.trim() ?? ''

    const paymentId =
      checkoutAttributes?.payments?.[0]?.id ??
      checkoutAttributes?.payment_intent
        ?.attributes?.payments?.[0]?.id ??
      null

    /*
     * A malformed or historical event should be acknowledged
     * instead of returning 400/500 forever and disabling the webhook.
     */
    if (
      !checkoutId ||
      !organizationId ||
      !planCode
    ) {
      console.warn(
        'PAYMONGO WEBHOOK IGNORED: incomplete metadata',
        {
          eventType,
          checkoutId,
          organizationId,
          planCode,
        },
      )

      return NextResponse.json({
        received: true,
        ignored: 'incomplete_metadata',
      })
    }

    const admin = createAdminClient()

    const {
      data: subscription,
      error: subscriptionError,
    } = await admin
      .from('organization_subscriptions')
      .select(
        `
          id,
          organization_id,
          paymongo_checkout_id,
          paymongo_plan_code,
          status
        `,
      )
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (subscriptionError) {
      console.error(
        'PAYMONGO SUBSCRIPTION LOOKUP ERROR:',
        subscriptionError,
      )

      return NextResponse.json(
        {
          error: 'Unable to verify subscription.',
        },
        {
          status: 500,
        },
      )
    }

    /*
     * This handles deleted test accounts and old webhook events.
     * Return 200 so PayMongo does not keep retrying stale deliveries.
     */
    if (!subscription) {
      console.warn(
        'PAYMONGO WEBHOOK IGNORED: organization subscription no longer exists',
        {
          organizationId,
          checkoutId,
          planCode,
        },
      )

      return NextResponse.json({
        received: true,
        ignored: 'subscription_not_found',
      })
    }

    /*
     * Prevent an older checkout from overriding a newer plan choice.
     */
    if (
      subscription.paymongo_checkout_id &&
      subscription.paymongo_checkout_id !==
        checkoutId
    ) {
      console.warn(
        'PAYMONGO WEBHOOK IGNORED: stale checkout',
        {
          organizationId,
          incomingCheckoutId: checkoutId,
          currentCheckoutId:
            subscription.paymongo_checkout_id,
        },
      )

      return NextResponse.json({
        received: true,
        ignored: 'stale_checkout',
      })
    }

    const {
      data: plan,
      error: planError,
    } = await admin
      .from('subscription_plans')
      .select('id, code, name')
      .eq('code', planCode)
      .maybeSingle()

    if (planError) {
      console.error(
        'PAYMONGO PLAN LOOKUP ERROR:',
        planError,
      )

      return NextResponse.json(
        {
          error: 'Unable to load subscription plan.',
        },
        {
          status: 500,
        },
      )
    }

    /*
     * Old plans should also be acknowledged rather than causing
     * endless webhook retries.
     */
    if (!plan) {
      console.warn(
        'PAYMONGO WEBHOOK IGNORED: plan not found',
        {
          planCode,
          organizationId,
          checkoutId,
        },
      )

      return NextResponse.json({
        received: true,
        ignored: 'plan_not_found',
      })
    }

    const {
      data: updatedSubscription,
      error: updateError,
    } = await admin
      .from('organization_subscriptions')
      .update({
        plan_id: plan.id,
        status: 'active',
        paymongo_checkout_id: checkoutId,
        paymongo_plan_code: planCode,
        paymongo_payment_id: paymentId,
      })
      .eq('id', subscription.id)
      .select('id')
      .maybeSingle()

    if (updateError) {
      console.error(
        'PAYMONGO SUBSCRIPTION UPDATE ERROR:',
        updateError,
      )

      return NextResponse.json(
        {
          error: 'Unable to activate subscription.',
        },
        {
          status: 500,
        },
      )
    }

    if (!updatedSubscription) {
      console.warn(
        'PAYMONGO WEBHOOK IGNORED: subscription disappeared before update',
        {
          organizationId,
          checkoutId,
        },
      )

      return NextResponse.json({
        received: true,
        ignored: 'subscription_missing_during_update',
      })
    }

    console.log(
      'PAYMONGO SUBSCRIPTION ACTIVATED:',
      {
        organizationId,
        checkoutId,
        planCode,
        paymentId,
      },
    )

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error(
      'PAYMONGO WEBHOOK PROCESSING ERROR:',
      error,
    )

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Webhook processing failed.',
      },
      {
        status: 500,
      },
    )
  }
}
import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

type PayMongoWebhookBody = {
  data?: {
    id?: string
    attributes?: {
      type?: string
      data?: {
        id?: string
        attributes?: {
          metadata?: {
            organization_id?: string
            plan_code?: string
          }
          payments?: Array<{
            id?: string
          }>
        }
      }
    }
  }
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as PayMongoWebhookBody

    console.log(
      'PAYMONGO WEBHOOK RECEIVED:',
      JSON.stringify(body, null, 2),
    )

    const eventType =
      body.data?.attributes?.type

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

    const checkoutId = checkoutSession?.id
    const checkoutAttributes =
      checkoutSession?.attributes
    const metadata =
      checkoutAttributes?.metadata

    const organizationId =
      metadata?.organization_id
    const planCode = metadata?.plan_code
    const paymentId =
      checkoutAttributes?.payments?.[0]?.id ?? null

    if (
      !checkoutId ||
      !organizationId ||
      !planCode
    ) {
      console.error(
        'PAYMONGO WEBHOOK METADATA MISSING:',
        {
          checkoutId,
          organizationId,
          planCode,
        },
      )

      return NextResponse.json(
        {
          error:
            'Checkout metadata is incomplete.',
        },
        {
          status: 400,
        },
      )
    }

    const admin = createAdminClient()

    const {
      data: plan,
      error: planError,
    } = await admin
      .from('subscription_plans')
      .select('id, code, name')
      .eq('code', planCode)
      .maybeSingle()

    if (planError || !plan) {
      console.error(
        'PLAN LOOKUP ERROR:',
        planError,
      )

      return NextResponse.json(
        {
          error: 'Subscription plan not found.',
        },
        {
          status: 404,
        },
      )
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
      .eq('organization_id', organizationId)
      .select('id')
      .maybeSingle()

    if (updateError || !updatedSubscription) {
      console.error(
        'DATABASE UPDATE ERROR:',
        updateError,
      )

      return NextResponse.json(
        {
          error:
            updateError?.message ??
            'Subscription record was not updated.',
        },
        {
          status: 500,
        },
      )
    }

    console.log(
      'SUBSCRIPTION ACTIVATED SUCCESSFULLY:',
      {
        organizationId,
        planCode,
        paymentId,
      },
    )

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error(
      'PAYMONGO WEBHOOK ERROR:',
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
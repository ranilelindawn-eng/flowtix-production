import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

import { getStripe } from '@/lib/stripe/server'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'

export const runtime = 'nodejs'

function idOf(value: string | { id: string } | null): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

async function resolvePlanId(subscription: Stripe.Subscription): Promise<string> {
  const admin = createTelephonyAdminClient()
  const metadataPlanId = subscription.metadata.plan_id?.trim()

  if (metadataPlanId) {
    const { data, error } = await admin
      .from('subscription_plans')
      .select('id')
      .eq('id', metadataPlanId)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      throw new Error(`Unable to validate the Flowtix plan: ${error.message}`)
    }

    if (data?.id) return data.id
  }

  const priceId = subscription.items.data[0]?.price.id
  if (!priceId) {
    throw new Error('The Stripe subscription does not contain a price.')
  }

  const { data, error } = await admin
    .from('subscription_plans')
    .select('id')
    .eq('stripe_price_id', priceId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw new Error(`Unable to map the Stripe price to a Flowtix plan: ${error.message}`)
  }

  if (!data?.id) {
    throw new Error(`No Flowtix plan is mapped to Stripe price ${priceId}.`)
  }

  return data.id
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata.organization_id?.trim()
  if (!organizationId) {
    throw new Error(`Stripe subscription ${subscription.id} is missing organization_id metadata.`)
  }

  const planId = await resolvePlanId(subscription)
  const item = subscription.items.data[0]
  const admin = createTelephonyAdminClient()

  const { error } = await admin
    .from('organization_subscriptions')
    .upsert(
      {
        organization_id: organizationId,
        plan_id: planId,
        stripe_customer_id: idOf(subscription.customer),
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        current_period_start: item?.current_period_start
          ? new Date(item.current_period_start * 1000).toISOString()
          : null,
        current_period_end: item?.current_period_end
          ? new Date(item.current_period_end * 1000).toISOString()
          : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' },
    )

  if (error) {
    throw new Error(`Unable to update the Flowtix subscription: ${error.message}`)
  }

  return organizationId
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe webhook is not configured.' },
      { status: 400 },
    )
  }

  let event: Stripe.Event

  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret,
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Invalid Stripe webhook signature: ${error.message}`
            : 'Invalid Stripe webhook signature.',
      },
      { status: 400 },
    )
  }

  try {
    const admin = createTelephonyAdminClient()
    const { data: existing, error: existingError } = await admin
      .from('subscription_events')
      .select('id')
      .eq('stripe_event_id', event.id)
      .maybeSingle()

    if (existingError) {
      throw new Error(`Unable to check webhook history: ${existingError.message}`)
    }

    if (existing) {
      return NextResponse.json({ received: true, duplicate: true })
    }

    let organizationId: string | null = null
    let subscriptionId: string | null = null

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object
      organizationId = await syncSubscription(subscription)
      subscriptionId = subscription.id
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      organizationId =
        session.metadata?.organization_id?.trim() ||
        session.client_reference_id?.trim() ||
        null
      subscriptionId = idOf(session.subscription)

      if (!organizationId) {
        throw new Error(`Checkout Session ${session.id} is missing an organization ID.`)
      }

      if (!subscriptionId) {
        throw new Error(`Checkout Session ${session.id} is missing a subscription ID.`)
      }

      let subscription = await getStripe().subscriptions.retrieve(subscriptionId)

      if (!subscription.metadata.organization_id) {
        subscription = await getStripe().subscriptions.update(subscription.id, {
          metadata: {
            ...subscription.metadata,
            organization_id: organizationId,
            ...(session.metadata?.plan_id
              ? { plan_id: session.metadata.plan_id }
              : {}),
            ...(session.metadata?.plan_code
              ? { plan_code: session.metadata.plan_code }
              : {}),
          },
        })
      }

      organizationId = await syncSubscription(subscription)
    }

    if (organizationId) {
      const { error: eventInsertError } = await admin
        .from('subscription_events')
        .insert({
          organization_id: organizationId,
          stripe_event_id: event.id,
          event_type: event.type,
          stripe_subscription_id: subscriptionId,
          payload: {
            livemode: event.livemode,
            created: event.created,
          },
        })

      if (eventInsertError) {
        throw new Error(`Unable to record the Stripe event: ${eventInsertError.message}`)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook processing failed', {
      eventId: event.id,
      eventType: event.type,
      error,
    })

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Webhook processing failed.',
      },
      { status: 500 },
    )
  }
}
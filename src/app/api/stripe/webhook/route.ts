import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

import { getStripe } from '@/lib/stripe/server'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'

export const runtime = 'nodejs'

function idOf(value: string | { id: string } | null): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata.organization_id
  if (!organizationId) return

  const priceId = subscription.items.data[0]?.price.id
  const admin = createTelephonyAdminClient()
  const { data: plan } = await admin.from('subscription_plans').select('id').eq('stripe_price_id', priceId).maybeSingle()
  if (!plan) throw new Error(`No Flowtix plan is mapped to Stripe price ${priceId}.`)

  const item = subscription.items.data[0]
  await admin.from('organization_subscriptions').upsert({
    organization_id: organizationId,
    plan_id: plan.id,
    stripe_customer_id: idOf(subscription.customer),
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    current_period_start: item?.current_period_start ? new Date(item.current_period_start * 1000).toISOString() : null,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id' })
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!signature || !webhookSecret) return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 400 })

  try {
    const event = getStripe().webhooks.constructEvent(await request.text(), signature, webhookSecret)
    const admin = createTelephonyAdminClient()
    const existing = await admin.from('subscription_events').select('id').eq('stripe_event_id', event.id).maybeSingle()
    if (existing.data) return NextResponse.json({ received: true, duplicate: true })

    let organizationId: string | null = null
    let subscriptionId: string | null = null

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object
      organizationId = subscription.metadata.organization_id || null
      subscriptionId = subscription.id
      await syncSubscription(subscription)
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      organizationId = session.metadata?.organization_id || session.client_reference_id
      subscriptionId = idOf(session.subscription)
      if (organizationId && subscriptionId) {
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId)
        if (!subscription.metadata.organization_id) {
          await getStripe().subscriptions.update(subscription.id, { metadata: { ...subscription.metadata, organization_id: organizationId } })
          subscription.metadata.organization_id = organizationId
        }
        await syncSubscription(subscription)
      }
    }

    if (organizationId) {
      await admin.from('subscription_events').insert({
        organization_id: organizationId,
        stripe_event_id: event.id,
        event_type: event.type,
        stripe_subscription_id: subscriptionId,
        payload: { livemode: event.livemode, created: event.created },
      })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook processing failed.' }, { status: 400 })
  }
}

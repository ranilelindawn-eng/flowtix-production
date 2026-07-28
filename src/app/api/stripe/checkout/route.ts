import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth'
import { getStripe } from '@/lib/stripe/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const organization = await requirePermission('billing.manage')
    const formData = await request.formData()
    const priceId = String(formData.get('priceId') ?? '').trim()
    if (!priceId) return NextResponse.json({ error: 'A subscription price is required.' }, { status: 400 })

    const supabase = await createClient()
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('id, code, stripe_price_id, is_active, is_public')
      .eq('stripe_price_id', priceId)
      .eq('is_active', true)
      .eq('is_public', true)
      .maybeSingle()

    if (planError) throw new Error(planError.message)
    if (!plan || plan.code === 'enterprise') return NextResponse.json({ error: 'Invalid subscription price.' }, { status: 400 })

    const { data: claims } = await supabase.auth.getClaims()
    const email = typeof claims?.claims?.email === 'string' ? claims.claims.email : undefined
    const { data: subscription } = await supabase
      .from('organization_subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('organization_id', organization.organization_id)
      .maybeSingle()

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || new URL(request.url).origin
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/dashboard/billing?checkout=success`,
      cancel_url: `${siteUrl}/dashboard/billing?checkout=cancelled`,
      allow_promotion_codes: true,
      client_reference_id: organization.organization_id,
      ...(subscription?.stripe_customer_id ? { customer: subscription.stripe_customer_id } : email ? { customer_email: email } : {}),
      metadata: { organization_id: organization.organization_id, plan_id: plan.id, plan_code: plan.code },
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          organization_id: organization.organization_id,
          plan_id: plan.id,
          plan_code: plan.code,
        },
      },
    })

    if (!session.url) throw new Error('Stripe did not return a Checkout URL.')
    return NextResponse.redirect(session.url, 303)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start checkout.' }, { status: 500 })
  }
}

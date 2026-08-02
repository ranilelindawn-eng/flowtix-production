import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth'
import { getStripe } from '@/lib/stripe/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const organization = await requirePermission('billing.manage')
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('organization_subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', organization.organization_id)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data?.stripe_customer_id) {
      return NextResponse.json({ error: 'No Stripe customer is connected to this organization.' }, { status: 400 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || new URL(request.url).origin
    const session = await getStripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${siteUrl}/dashboard/billing`,
    })

    return NextResponse.redirect(session.url, 303)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to open billing portal.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

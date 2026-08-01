import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth'
import { payMongoRequest } from '@/lib/paymongo'
import { createClient } from '@/lib/supabase/server'

type PayMongoCheckoutResponse = {
  data: {
    id: string
    type: 'checkout_session'
    attributes: {
      checkout_url: string
    }
  }
}

function createReferenceNumber(
  organizationId: string,
  planCode: string,
): string {
  const organizationSuffix = organizationId.replaceAll('-', '').slice(-10)
  const timestamp = Date.now().toString(36).toUpperCase()

  return `FLOWTIX-${planCode.toUpperCase()}-${organizationSuffix}-${timestamp}`
}

export async function POST(request: Request) {
  try {
    const organization = await requirePermission('billing.manage')
    const formData = await request.formData()
    const planId = String(formData.get('planId') ?? '').trim()
    const planCode = String(formData.get('planCode') ?? '').trim()

    if (!planId && !planCode) {
      return NextResponse.json(
        { error: 'A subscription plan is required.' },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    let planQuery = supabase
      .from('subscription_plans')
      .select(
        'id, code, name, description, monthly_price_cents, is_active, is_public',
      )
      .eq('is_active', true)
      .eq('is_public', true)

    planQuery = planId
      ? planQuery.eq('id', planId)
      : planQuery.eq('code', planCode)

    const { data: plan, error: planError } =
      await planQuery.maybeSingle()

    if (planError) {
      throw new Error(planError.message)
    }

    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid subscription plan.' },
        { status: 400 },
      )
    }

    if (
      !Number.isInteger(plan.monthly_price_cents) ||
      plan.monthly_price_cents <= 0
    ) {
      return NextResponse.json(
        { error: 'This plan requires a custom billing arrangement.' },
        { status: 400 },
      )
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
      new URL(request.url).origin

    const checkoutSession =
      await payMongoRequest<PayMongoCheckoutResponse>(
        '/v2/checkout_sessions',
        {
          method: 'POST',
          body: {
            data: {
              attributes: {
                line_items: [
                  {
                    name: `${plan.name} subscription`,
                    description:
                      plan.description ??
                      `${plan.name} monthly Flowtix subscription`,
                    amount: plan.monthly_price_cents,
                    currency: 'PHP',
                    quantity: 1,
                  },
                ],
                payment_method_types: ['card', 'gcash', 'qrph'],
                success_url: `${siteUrl}/dashboard/billing?checkout=success`,
                cancel_url: `${siteUrl}/dashboard/billing?checkout=cancelled`,
                reference_number: createReferenceNumber(
                  organization.organization_id,
                  plan.code,
                ),
                send_email_receipt: true,
                metadata: {
                  organization_id: organization.organization_id,
                  plan_id: plan.id,
                  plan_code: plan.code,
                },
              },
            },
          },
        },
      )

    const checkoutUrl =
      checkoutSession.data.attributes.checkout_url?.trim()

    if (!checkoutUrl) {
      throw new Error(
        'PayMongo did not return a hosted Checkout URL.',
      )
    }

    return NextResponse.redirect(checkoutUrl, 303)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to start PayMongo checkout.',
      },
      { status: 500 },
    )
  }
}
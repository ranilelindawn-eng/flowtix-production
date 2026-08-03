import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentOrganization } from '@/lib/team'

const plans = {
  Starter: {
    code: 'starter',
    amount: 170000,
    name: 'Flowtix Starter',
  },
  Professional: {
    code: 'pro',
    amount: 460000,
    name: 'Flowtix Professional',
  },
  Business: {
    code: 'business',
    amount: 1150000,
    name: 'Flowtix Business',
  },
  Enterprise: {
    code: 'enterprise',
    amount: 2900000,
    name: 'Flowtix Enterprise',
  },
} as const

type PlanName = keyof typeof plans

const getAppUrl = () => {
  const url =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim()

  return (url || 'http://localhost:3000').replace(
    /\/$/,
    '',
  )
}

export async function POST(request: Request) {
  try {
    const secretKey =
      process.env.PAYMONGO_SECRET_KEY?.trim()

    if (!secretKey) {
      return NextResponse.json(
        {
          error: 'Missing PAYMONGO_SECRET_KEY.',
        },
        {
          status: 500,
        },
      )
    }

    const organization =
      await getCurrentOrganization()

    if (!organization) {
      return NextResponse.json(
        {
          error: 'Organization not found.',
        },
        {
          status: 401,
        },
      )
    }

    if (organization.role !== 'owner') {
      return NextResponse.json(
        {
          error:
            'Only the workspace owner can change plans.',
        },
        {
          status: 403,
        },
      )
    }

    const formData = await request.formData()
    const selectedPlan =
      formData.get('plan')?.toString().trim()

    if (
      !selectedPlan ||
      !(selectedPlan in plans)
    ) {
      return NextResponse.json(
        {
          error: 'Invalid plan selected.',
        },
        {
          status: 400,
        },
      )
    }

    const plan = plans[selectedPlan as PlanName]
    const appUrl = getAppUrl()

    const response = await fetch(
      'https://api.paymongo.com/v1/checkout_sessions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            'Basic ' +
            Buffer.from(`${secretKey}:`).toString(
              'base64',
            ),
        },
        body: JSON.stringify({
          data: {
            attributes: {
              line_items: [
                {
                  currency: 'PHP',
                  amount: plan.amount,
                  name: plan.name,
                  quantity: 1,
                  description:
                    `${plan.name} monthly subscription`,
                },
              ],
              payment_method_types: [
                'card',
                'gcash',
                'paymaya',
              ],
              send_email_receipt: true,
              show_description: true,
              show_line_items: true,
              metadata: {
                organization_id:
                  organization.organization_id,
                plan_code: plan.code,
              },
              success_url:
                `${appUrl}/dashboard?payment=success`,
              cancel_url:
                `${appUrl}/dashboard/billing?checkout=cancelled`,
            },
          },
        }),
        cache: 'no-store',
      },
    )

    const result = (await response.json()) as {
      data?: {
        id?: string
        attributes?: {
          checkout_url?: string
        }
      }
      errors?: Array<{
        code?: string
        detail?: string
      }>
    }

    if (!response.ok) {
      console.error('PAYMONGO CHECKOUT ERROR:', result)

      return NextResponse.json(
        {
          error: 'PayMongo checkout failed.',
          details: result,
        },
        {
          status: response.status,
        },
      )
    }

    const checkoutId = result.data?.id
    const checkoutUrl =
      result.data?.attributes?.checkout_url

    if (!checkoutId || !checkoutUrl) {
      return NextResponse.json(
        {
          error:
            'PayMongo did not return a checkout URL.',
        },
        {
          status: 502,
        },
      )
    }

    const admin = createAdminClient()

    const {
      data: updatedSubscription,
      error: updateError,
    } = await admin
      .from('organization_subscriptions')
      .update({
        paymongo_checkout_id: checkoutId,
        paymongo_plan_code: plan.code,
        paymongo_payment_id: null,
        status: 'pending',
      })
      .eq(
        'organization_id',
        organization.organization_id,
      )
      .select('id')
      .maybeSingle()

    if (updateError || !updatedSubscription) {
      console.error(
        'SUBSCRIPTION UPDATE ERROR:',
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

    return NextResponse.redirect(checkoutUrl, 303)
  } catch (error) {
    console.error('PAYMONGO CHECKOUT ERROR:', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Server error.',
      },
      {
        status: 500,
      },
    )
  }
}
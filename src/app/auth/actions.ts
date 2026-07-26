'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { writeAuditLog } from '@/lib/security/audit'
import { getStripe } from '@/lib/stripe'

const allowedPlans = ['starter', 'professional', 'business'] as const

type Plan = (typeof allowedPlans)[number]

const createAuthClient = async () => {
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    throw new Error(
      'Missing Supabase environment variables. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.',
    )
  }

  return supabase
}

const getString = (formData: FormData, key: string) =>
  formData.get(key)?.toString().trim() ?? ''

const getPlan = (formData: FormData): Plan => {
  const requestedPlan = getString(formData, 'plan').toLowerCase()

  return allowedPlans.includes(requestedPlan as Plan)
    ? (requestedPlan as Plan)
    : 'starter'
}

const getStripePriceId = (plan: Plan) => {
  const priceIds: Record<Plan, string | undefined> = {
    starter: process.env.STRIPE_STARTER_PRICE_ID,
    professional: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
    business: process.env.STRIPE_BUSINESS_PRICE_ID,
  }

  const priceId = priceIds[plan]

  if (!priceId) {
    throw new Error(
      `Missing Stripe Price ID for the ${plan} plan. Check your .env.local file.`,
    )
  }

  return priceId
}

const getSiteUrl = () => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (!siteUrl) {
    return 'http://localhost:3000'
  }

  return siteUrl.replace(/\/$/, '')
}

export async function signIn(formData: FormData) {
  const email = getString(formData, 'email')
  const password = getString(formData, 'password')

  if (!email || !password) {
    throw new Error('Email and password are required.')
  }

  await enforceRateLimit(`signin:${email.toLowerCase()}`, 8, 300)

  const supabase = await createAuthClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  await writeAuditLog('auth.sign_in', 'user')

  redirect('/dashboard')
}

export async function signUp(formData: FormData) {
  const email = getString(formData, 'email')
  const password = getString(formData, 'password')
  const plan = getPlan(formData)

  if (!email || !password) {
    throw new Error('Email and password are required.')
  }

  await enforceRateLimit(`signup:${email.toLowerCase()}`, 3, 300)

  const supabase = await createAuthClient()
  const siteUrl = getSiteUrl()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=/login`,
      data: {
        selected_plan: plan,
      },
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('Supabase did not return a user after signup.')
  }

  const stripe = getStripe()
  const priceId = getStripePriceId(plan)

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    client_reference_id: data.user.id,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    payment_method_collection: 'always',
    subscription_data: {
      trial_period_days: 3,
      metadata: {
        supabase_user_id: data.user.id,
        plan,
      },
    },
    metadata: {
      supabase_user_id: data.user.id,
      plan,
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/pricing?checkout=cancelled`,
  })

  if (!checkoutSession.url) {
    throw new Error('Stripe did not return a Checkout URL.')
  }

  await writeAuditLog('auth.sign_up', 'user')

  redirect(checkoutSession.url)
}

export async function signOut() {
  const supabase = await createAuthClient()

  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(error.message)
  }

  redirect('/')
}

export async function requestPasswordReset(formData: FormData) {
  const email = getString(formData, 'email')

  if (!email) {
    throw new Error('Please enter your email address.')
  }

  await enforceRateLimit(
    `password-reset:${email.toLowerCase()}`,
    3,
    900,
  )

  const supabase = await createAuthClient()

  const redirectTo =
    `${getSiteUrl()}/auth/callback?next=/reset-password`

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  })

  if (error) {
    throw new Error(error.message)
  }

  redirect('/login?reset=sent')
}

export async function updatePassword(formData: FormData) {
  const password = getString(formData, 'password')

  if (!password) {
    throw new Error('Please enter a new password.')
  }

  if (password.length < 8) {
    throw new Error('Your password must contain at least 8 characters.')
  }

  const supabase = await createAuthClient()

  const { error } = await supabase.auth.updateUser({
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  await writeAuditLog('auth.password_updated', 'user')

  redirect('/login?password=updated')
}
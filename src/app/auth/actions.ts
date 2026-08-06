'use server'

import { redirect } from 'next/navigation'

import { createPayMongoCheckoutSession } from '@/lib/paymongo/client'
import { getPayMongoPlan } from '@/lib/paymongo/plans'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { writeAuditLog } from '@/lib/security/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const allowedPlans = [
  'starter',
  'professional',
  'business',
  'enterprise',
] as const

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

const getSafeRedirectPath = (value: string) => {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/dashboard'
  }

  return value
}

const isInvitationPath = (value: string) =>
  /^\/invite\/[0-9a-f-]{36}$/i.test(value)

const getPlan = (formData: FormData): Plan => {
  const requestedPlan = getString(
    formData,
    'plan',
  ).toLowerCase()

  return allowedPlans.includes(requestedPlan as Plan)
    ? (requestedPlan as Plan)
    : 'starter'
}

const getSiteUrl = () => {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (!appUrl) {
    return 'http://localhost:3000'
  }

  return appUrl.replace(/\/$/, '')
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })

async function findCreatedOrganization(
  userId: string,
): Promise<string> {
  const admin = createAdminClient()

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(
        `Unable to find the new workspace: ${error.message}`,
      )
    }

    if (data?.organization_id) {
      return data.organization_id
    }

    await wait(250)
  }

  throw new Error(
    'Your account was created, but the workspace setup did not finish. Please sign in and retry checkout.',
  )
}

async function waitForSubscription(
  organizationId: string,
): Promise<string> {
  const admin = createAdminClient()

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await admin
      .from('organization_subscriptions')
      .select('id')
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(
        `Unable to load the new subscription: ${error.message}`,
      )
    }

    if (data?.id) {
      return data.id
    }

    await wait(250)
  }

  throw new Error(
    'Your workspace was created, but its subscription record is not ready.',
  )
}

async function createSignupCheckout({
  email,
  userId,
  organizationId,
  plan,
  siteUrl,
  hasSession,
}: {
  email: string
  userId: string
  organizationId: string
  plan: Plan
  siteUrl: string
  hasSession: boolean
}) {
  const selectedPlan = await getPayMongoPlan(plan)

  if (!selectedPlan) {
    throw new Error('The selected PayMongo plan is unavailable.')
  }

  const successUrl = hasSession
    ? `${siteUrl}/dashboard?payment=success`
    : `${siteUrl}/login?payment=success&next=${encodeURIComponent(
        '/dashboard',
      )}`

  const { checkoutId, checkoutUrl } =
    await createPayMongoCheckoutSession({
      amount: selectedPlan.amount,
      name: selectedPlan.name,
      description: `${selectedPlan.name} monthly subscription`,
      customerEmail: email,
      metadata: {
        organization_id: organizationId,
        supabase_user_id: userId,
        plan_code: selectedPlan.code,
        signup_plan: plan,
        billing_provider: 'paymongo',
      },
      successUrl,
      cancelUrl: `${siteUrl}/pricing?checkout=cancelled`,
    })

  const admin = createAdminClient()
  const { data: updatedSubscription, error: updateError } = await admin
    .from('organization_subscriptions')
    .update({
      billing_provider: 'paymongo',
      paymongo_checkout_id: checkoutId,
      paymongo_plan_code: selectedPlan.code,
      paymongo_payment_id: null,
      provider_checkout_id: checkoutId,
      provider_payment_id: null,
      status: 'pending',
      billing_metadata: {
        checkout_created_at: new Date().toISOString(),
        requested_plan_code: selectedPlan.code,
        signup_checkout: true,
      },
    })
    .eq('organization_id', organizationId)
    .select('id')
    .maybeSingle()

  if (updateError) {
    throw new Error(
      `Unable to save the pending subscription: ${updateError.message}`,
    )
  }

  if (!updatedSubscription) {
    throw new Error(
      'The subscription record was not updated before checkout.',
    )
  }

  return checkoutUrl
}


export async function signIn(formData: FormData) {
  const email = getString(formData, 'email')
  const password = getString(formData, 'password')
  const next = getSafeRedirectPath(
    getString(formData, 'next'),
  )

  if (!email || !password) {
    throw new Error('Email and password are required.')
  }

  await enforceRateLimit(
    `signin:${email.toLowerCase()}`,
    8,
    300,
  )

  const supabase = await createAuthClient()

  const { error } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    })

  if (error) {
    throw new Error(error.message)
  }

  await writeAuditLog('auth.sign_in', 'user')

  redirect(next)
}

export async function signUp(formData: FormData) {
  const email = getString(formData, 'email')
  const password = getString(formData, 'password')
  const plan = getPlan(formData)
  const requestedNext = getSafeRedirectPath(
    getString(formData, 'next'),
  )
  const invitationSignup =
    isInvitationPath(requestedNext)
  const invitedEmail = getString(
    formData,
    'invited_email',
  ).toLowerCase()

  if (!email || !password) {
    throw new Error('Email and password are required.')
  }

  if (password.length < 8) {
    throw new Error(
      'Your password must contain at least 8 characters.',
    )
  }

  if (
    invitationSignup &&
    (!invitedEmail ||
      email.toLowerCase() !== invitedEmail)
  ) {
    throw new Error(
      'Use the email address that received the invitation.',
    )
  }

  await enforceRateLimit(
    `signup:${email.toLowerCase()}`,
    3,
    300,
  )

  const supabase = await createAuthClient()
  const siteUrl = getSiteUrl()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo:
        `${siteUrl}/auth/callback?next=${encodeURIComponent(
          invitationSignup ? requestedNext : '/dashboard',
        )}`,
      data: invitationSignup
        ? {
            invited_user: true,
          }
        : {
            selected_plan: plan,
            billing_provider: 'paymongo',
          },
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error(
      'Supabase did not return a user after signup.',
    )
  }

  if (invitationSignup) {
    await writeAuditLog(
      'auth.invited_user_sign_up',
      'user',
    )

    if (data.session) {
      redirect(requestedNext)
    }

    redirect(
      `/login?invite=confirmation-required&next=${encodeURIComponent(
        requestedNext,
      )}`,
    )
  }

  const organizationId =
    await findCreatedOrganization(data.user.id)

  await waitForSubscription(organizationId)

  const checkoutUrl = await createSignupCheckout({
    email,
    userId: data.user.id,
    organizationId,
    plan,
    siteUrl,
    hasSession: Boolean(data.session),
  })

  await writeAuditLog('auth.sign_up', 'user')

  redirect(checkoutUrl)
}

export async function signOut() {
  const supabase = await createAuthClient()

  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(error.message)
  }

  redirect('/')
}

export async function requestPasswordReset(
  formData: FormData,
) {
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

  const { error } =
    await supabase.auth.resetPasswordForEmail(email, {
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
    throw new Error(
      'Your password must contain at least 8 characters.',
    )
  }

  const supabase = await createAuthClient()

  const { error } = await supabase.auth.updateUser({
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  await writeAuditLog(
    'auth.password_updated',
    'user',
  )

  redirect('/login?password=updated')
}
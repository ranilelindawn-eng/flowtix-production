'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { writeAuditLog } from '@/lib/security/audit'

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
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard'
  }

  return value
}

const isInvitationPath = (value: string) =>
  /^\/invite\/[0-9a-f-]{36}$/i.test(value)

const getPlan = (formData: FormData): Plan => {
  const requestedPlan = getString(formData, 'plan').toLowerCase()

  return allowedPlans.includes(requestedPlan as Plan)
    ? (requestedPlan as Plan)
    : 'starter'
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
  const next = getSafeRedirectPath(getString(formData, 'next'))

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

  redirect(next)
}

export async function signUp(formData: FormData) {
  const email = getString(formData, 'email')
  const password = getString(formData, 'password')
  const plan = getPlan(formData)
  const next = getSafeRedirectPath(getString(formData, 'next'))
  const invitationSignup = isInvitationPath(next)
  const invitedEmail = getString(formData, 'invited_email').toLowerCase()

  if (!email || !password) {
    throw new Error('Email and password are required.')
  }

  if (password.length < 8) {
    throw new Error('Your password must contain at least 8 characters.')
  }

  if (invitationSignup && (!invitedEmail || email.toLowerCase() !== invitedEmail)) {
    throw new Error('Use the email address that received the invitation.')
  }

  await enforceRateLimit(`signup:${email.toLowerCase()}`, 3, 300)

  const supabase = await createAuthClient()
  const siteUrl = getSiteUrl()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(
        invitationSignup ? next : '/login',
      )}`,
      data: invitationSignup
        ? { invited_user: true }
        : { selected_plan: plan },
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('Supabase did not return a user after signup.')
  }

  // Invited team members join an existing workspace subscription and must
  // not be sent through a separate billing flow.
  if (invitationSignup) {
    await writeAuditLog('auth.invited_user_sign_up', 'user')

    if (data.session) {
      redirect(next)
    }

    redirect(
      `/login?invite=confirmation-required&next=${encodeURIComponent(next)}`,
    )
  }

  await writeAuditLog('auth.sign_up', 'user')

  const billingPath = `/dashboard/billing?plan=${encodeURIComponent(plan)}`

  // PayMongo Checkout requires an authenticated workspace and organization.
  // When email confirmation is disabled, the new session can proceed directly.
  // Otherwise, the user confirms their email, signs in, and then chooses the
  // selected plan from the billing page.
  if (data.session) {
    redirect(billingPath)
  }

  redirect(
    `/login?signup=confirmation-required&next=${encodeURIComponent(
      billingPath,
    )}`,
  )
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
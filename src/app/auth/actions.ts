'use server'

import { redirect } from 'next/navigation'

import { getUserFacingErrorMessage } from '@/lib/errors/user-facing'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { writeAuditLog } from '@/lib/security/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const allowedPlans = [
  'starter',
  'professional',
  'business',
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

async function startSignupTrial({
  organizationId,
  userId,
  plan,
}: {
  organizationId: string
  userId: string
  plan: Plan
}) {
  const admin = createAdminClient()

  const { data, error } = await admin.rpc(
    'start_flowtix_trial',
    {
      p_organization_id: organizationId,
      p_plan_code: plan,
      p_actor_user_id: userId,
    },
  )

  if (error) {
    throw new Error(
      `Unable to start the 7-day trial: ${error.message}`,
    )
  }

  const trial = data as {
    subscription_id?: string
    trial_ends_at?: string
  } | null

  if (!trial?.subscription_id || !trial.trial_ends_at) {
    throw new Error(
      'Flowtix did not return a valid trial subscription.',
    )
  }

  return trial
}


export async function signIn(
  previousState: { status: 'idle' | 'error'; message: string },
  formData: FormData,
) {
  void previousState
  const email = getString(formData, 'email')
  const password = getString(formData, 'password')
  const next = getSafeRedirectPath(
    getString(formData, 'next'),
  )

  if (!email || !password) {
    return {
      status: 'error' as const,
      message: 'Enter both your email address and password.',
    }
  }

  try {
    await enforceRateLimit(
      `signin:${email.toLowerCase()}`,
      8,
      300,
    )
  } catch (error) {
    return {
      status: 'error' as const,
      message: getUserFacingErrorMessage(error, {
        context: 'authentication',
      }),
    }
  }

  let supabase: Awaited<ReturnType<typeof createAuthClient>>

  try {
    supabase = await createAuthClient()
  } catch (error) {
    console.error('Unable to create the sign-in client:', error)
    return {
      status: 'error' as const,
      message:
        'Flowtix authentication is temporarily unavailable. Please try again shortly.',
    }
  }

  const { error } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    })

  if (error) {
    return {
      status: 'error' as const,
      message: getUserFacingErrorMessage(error, {
        context: 'authentication',
      }),
    }
  }

  try {
    await writeAuditLog('auth.sign_in', 'user')
  } catch (error) {
    console.error('Unable to record the sign-in audit event:', error)
    return {
      status: 'error' as const,
      message:
        'Your credentials were accepted, but Flowtix could not finish the secure sign-in process. Refresh the page or sign in again.',
    }
  }

  redirect(next)
}

export async function signUp(
  previousState: { status: 'idle' | 'error'; message: string },
  formData: FormData,
) {
  void previousState
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
    return {
      status: 'error' as const,
      message: 'Enter both an email address and password.',
    }
  }

  if (password.length < 8) {
    return {
      status: 'error' as const,
      message: 'Your password must contain at least 8 characters.',
    }
  }

  if (
    invitationSignup &&
    (!invitedEmail ||
      email.toLowerCase() !== invitedEmail)
  ) {
    return {
      status: 'error' as const,
      message: 'Use the email address that received the invitation.',
    }
  }

  try {
    await enforceRateLimit(
      `signup:${email.toLowerCase()}`,
      3,
      300,
    )
  } catch (error) {
    return {
      status: 'error' as const,
      message: getUserFacingErrorMessage(error, {
        context: 'signup',
      }),
    }
  }

  let supabase: Awaited<ReturnType<typeof createAuthClient>>

  try {
    supabase = await createAuthClient()
  } catch (error) {
    console.error('Unable to create the signup client:', error)
    return {
      status: 'error' as const,
      message:
        'Flowtix account registration is temporarily unavailable. Please try again shortly.',
    }
  }

  const siteUrl = getSiteUrl()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo:
        `${siteUrl}/auth/callback?next=${encodeURIComponent(
          invitationSignup
            ? requestedNext
            : '/dashboard/billing?trial=started',
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
    return {
      status: 'error' as const,
      message: getUserFacingErrorMessage(error, {
        context: 'signup',
      }),
    }
  }

  // Supabase can intentionally obscure duplicate registrations by returning
  // a user with no identities. Turn that into useful, non-technical guidance.
  if (
    data.user &&
    Array.isArray(data.user.identities) &&
    data.user.identities.length === 0
  ) {
    return {
      status: 'error' as const,
      message:
        'A Flowtix account already uses this email address. Sign in instead, or use Forgot password if you cannot remember the password.',
    }
  }

  if (!data.user) {
    return {
      status: 'error' as const,
      message:
        'Flowtix could not finish creating your account. Please try again. If the email is already registered, sign in instead.',
    }
  }

  if (invitationSignup) {
    try {
      await writeAuditLog(
        'auth.invited_user_sign_up',
        'user',
      )
    } catch (auditError) {
      console.error('Unable to record invited-user signup:', auditError)
      return {
        status: 'error' as const,
        message:
          'Your account was created, but Flowtix could not finish the secure invitation setup. Sign in again and reopen the invitation.',
      }
    }

    if (data.session) {
      redirect(requestedNext)
    }

    redirect(
      `/login?invite=confirmation-required&next=${encodeURIComponent(
        requestedNext,
      )}`,
    )
  }

  try {
    const organizationId =
      await findCreatedOrganization(data.user.id)

    await waitForSubscription(organizationId)

    await startSignupTrial({
      organizationId,
      userId: data.user.id,
      plan,
    })

    await writeAuditLog('auth.sign_up', 'user')
  } catch (signupError) {
    console.error('Flowtix signup setup failed:', signupError)
    return {
      status: 'error' as const,
      message: getUserFacingErrorMessage(signupError, {
        context: 'signup',
        fallbackMessage:
          'Your account was created, but Flowtix could not finish setting up the workspace and trial. Sign in and retry, or contact support if the workspace is still unavailable.',
      }),
    }
  }

  const trialDestination =
    '/dashboard/billing?trial=started'

  if (data.session) {
    redirect(trialDestination)
  }

  redirect(
    `/login?trial=confirmation-required&next=${encodeURIComponent(
      trialDestination,
    )}`,
  )
}

export async function signOut() {
  const supabase = await createAuthClient()

  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(
      getUserFacingErrorMessage(error, {
        context: 'signout',
      }),
    )
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
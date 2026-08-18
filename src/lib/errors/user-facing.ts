export type UserFacingErrorContext =
  | 'authentication'
  | 'signup'
  | 'signout'
  | 'password-reset'
  | 'dashboard'
  | 'campaign'
  | 'search'
  | 'upload'
  | 'ai'
  | 'security'
  | 'general'

export type UserFacingError = {
  title: string
  message: string
}

type UserFacingErrorOptions = {
  context?: UserFacingErrorContext
  fallbackTitle?: string
  fallbackMessage?: string
}

function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim()
  if (typeof error === 'string') return error.trim()

  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value.trim()
  }

  return ''
}

function includesAny(value: string, terms: readonly string[]) {
  return terms.some((term) => value.includes(term))
}

function fallbackForContext(context: UserFacingErrorContext): UserFacingError {
  switch (context) {
    case 'authentication':
      return {
        title: 'Sign-in could not be completed',
        message:
          'Flowtix could not verify your sign-in. Check your email and password, then try again.',
      }
    case 'signup':
      return {
        title: 'Account could not be created',
        message:
          'Flowtix could not complete account creation. Check the information you entered and try again.',
      }
    case 'signout':
      return {
        title: 'Sign-out could not be completed',
        message:
          'Flowtix could not securely end your session. Check your connection and try signing out again.',
      }
    case 'password-reset':
      return {
        title: 'Password request could not be completed',
        message:
          'Flowtix could not complete the password request. Please try again or request a new reset link.',
      }
    case 'campaign':
      return {
        title: 'Campaign could not be saved',
        message:
          'Check the campaign details and try again. No campaign changes were saved.',
      }
    case 'search':
      return {
        title: 'Search is temporarily unavailable',
        message: 'Flowtix could not complete the search. Please try again.',
      }
    case 'upload':
      return {
        title: 'Upload could not be completed',
        message:
          'Flowtix could not complete the upload. Check the file and your plan storage limit, then try again.',
      }
    case 'ai':
      return {
        title: 'AI request could not be completed',
        message:
          'Flowtix could not complete this AI request. Check your plan access and usage, then try again.',
      }
    case 'security':
      return {
        title: 'Security action could not be completed',
        message:
          'Flowtix could not complete the security action. Review the information and try again.',
      }
    case 'dashboard':
      return {
        title: 'This page could not be loaded',
        message:
          'Flowtix could not complete this request. Please retry. If the problem continues, use the error reference when contacting support.',
      }
    default:
      return {
        title: 'Request could not be completed',
        message: 'Flowtix could not complete this request. Please try again.',
      }
  }
}

function safeDomainMessage(message: string): boolean {
  const lower = message.toLowerCase()

  return (
    lower.startsWith('campaign name is required') ||
    lower.startsWith('the campaign end date cannot') ||
    lower.startsWith('the campaign start date') ||
    lower.startsWith('team member limit reached') ||
    lower.startsWith('contact limit reached') ||
    lower.startsWith('active campaign limit reached') ||
    lower.startsWith('active sequence limit reached') ||
    lower.startsWith('storage limit reached') ||
    lower.startsWith('monthly transcription limit reached') ||
    lower.startsWith('your password must') ||
    lower.startsWith('the passwords do not match') ||
    lower.startsWith('please enter') ||
    lower.startsWith('use the email address that received') ||
    lower.startsWith('flowtix calling') ||
    lower.startsWith('flowtix softphone') ||
    lower.startsWith('flowtix does not currently have a platform calling number') ||
    lower.startsWith('an identical request is already') ||
    lower.startsWith('this idempotency key') ||
    lower.startsWith('this password reset link is invalid') ||
    lower.startsWith('the authentication link') ||
    lower.startsWith('too many requests') ||
    lower.startsWith('too many messages') ||
    lower.startsWith('you do not have permission') ||
    lower.startsWith("you don't have permission")
  )
}

export function getUserFacingError(
  error: unknown,
  options: UserFacingErrorOptions = {},
): UserFacingError {
  const context = options.context ?? 'general'
  const fallback = fallbackForContext(context)
  const message = readMessage(error)
  const lower = message.toLowerCase()

  const customFallback: UserFacingError = {
    title: options.fallbackTitle ?? fallback.title,
    message: options.fallbackMessage ?? fallback.message,
  }

  if (!message) return customFallback

  if (
    includesAny(lower, [
      'invalid login credentials',
      'invalid email or password',
      'email or password is invalid',
    ])
  ) {
    return {
      title: 'Email or password is incorrect',
      message:
        'The email address or password you entered does not match a Flowtix account. Check both fields and try again.',
    }
  }

  if (includesAny(lower, ['email not confirmed', 'email_not_confirmed'])) {
    return {
      title: 'Confirm your email first',
      message:
        'Your Flowtix email address has not been confirmed yet. Open the newest confirmation email, confirm the account, then sign in again.',
    }
  }

  if (
    includesAny(lower, [
      'user already registered',
      'already been registered',
      'already registered',
      'identity already exists',
      'user already exists',
    ])
  ) {
    return {
      title: 'An account already exists',
      message:
        'A Flowtix account already uses this email address. Sign in instead, or use Forgot password if you cannot remember the password.',
    }
  }

  if (includesAny(lower, ['password should be', 'password is too short', 'weak password'])) {
    return {
      title: 'Choose a stronger password',
      message:
        'Your password does not meet the account security requirements. Use at least 8 characters and try again.',
    }
  }

  if (
    includesAny(lower, [
      'rate limit',
      'too many requests',
      'request rate limit reached',
      'email rate limit exceeded',
      'over_email_send_rate_limit',
    ])
  ) {
    return {
      title: 'Too many attempts',
      message:
        'Too many requests were made in a short period. Wait a few minutes, then try again.',
    }
  }

  if (
    includesAny(lower, [
      'auth session missing',
      'session not found',
      'jwt expired',
      'invalid jwt',
      'no authenticated user was found',
      'unable to verify the authenticated user',
      'authentication required',
    ])
  ) {
    return {
      title: 'Your session has expired',
      message:
        'Flowtix can no longer verify your signed-in session. Sign in again, then retry this action.',
    }
  }

  if (
    includesAny(lower, [
      'permission denied',
      'not authorized',
      'unauthorized',
      'row-level security',
      'violates row-level security',
    ])
  ) {
    return {
      title: 'You do not have permission for this action',
      message:
        'Your current workspace role does not allow this action. Ask a workspace owner or administrator if you need additional access.',
    }
  }

  if (includesAny(lower, ['feature_not_included', 'subscription_access_required'])) {
    return {
      title: 'Your plan does not include this feature',
      message:
        'This feature requires a higher Flowtix plan. Open Billing to review the plans available to your workspace.',
    }
  }

  if (includesAny(lower, ['usage_limit_reached'])) {
    return {
      title: 'Plan limit reached',
      message:
        'Your workspace has reached the current plan limit for this action. Reduce current usage or upgrade the plan to continue.',
    }
  }

  if (
    includesAny(lower, [
      'could not find the function',
      'schema cache',
      'pgrst202',
      'pgrst204',
    ])
  ) {
    return {
      title: 'A Flowtix database update is still syncing',
      message:
        'The required database function is not available to the application yet. Refresh the page shortly. If it continues, contact Flowtix support.',
    }
  }

  if (includesAny(lower, ['duplicate key value', 'unique constraint', 'already exists'])) {
    return {
      title: 'This record already exists',
      message:
        'Flowtix found an existing record with the same unique information. Review the existing record or change the duplicate value and try again.',
    }
  }

  if (includesAny(lower, ['foreign key constraint', 'violates foreign key'])) {
    return {
      title: 'This item is still linked to other data',
      message:
        'Flowtix cannot complete this change while related records still depend on this item. Remove or update the related records first.',
    }
  }

  if (
    includesAny(lower, [
      'failed to fetch',
      'fetch failed',
      'networkerror',
      'network request failed',
      'load failed',
    ])
  ) {
    return {
      title: 'Network connection problem',
      message:
        'Flowtix could not reach the service. Check your internet connection and try again.',
    }
  }

  if (
    includesAny(lower, [
      'an error occurred in the server components render',
      'server components render',
      'unexpected server response',
    ])
  ) {
    return customFallback
  }

  if (safeDomainMessage(message)) {
    const title = lower.includes('limit reached')
      ? 'Plan limit reached'
      : context === 'campaign'
        ? 'Campaign needs attention'
        : customFallback.title

    return { title, message }
  }

  // Do not surface provider/database internals such as SQL, constraint names,
  // stack fragments, environment variable names, or long technical payloads.
  if (
    message.length > 280 ||
    includesAny(lower, [
      'postgres',
      'supabase',
      'sqlstate',
      'constraint',
      'relation "',
      'column "',
      'rpc(',
      'next_public_',
      'service_role',
      'stack',
      '.next/server',
    ])
  ) {
    return customFallback
  }

  if (
    lower.startsWith('unable to ') ||
    lower.startsWith('failed to ') ||
    lower.startsWith('could not ') ||
    lower.startsWith('the ') ||
    lower.startsWith('your ') ||
    lower.startsWith('please ') ||
    lower.startsWith('select ') ||
    lower.startsWith('no ')
  ) {
    return {
      title: customFallback.title,
      message,
    }
  }

  return customFallback
}

export function getUserFacingErrorMessage(
  error: unknown,
  options: UserFacingErrorOptions = {},
): string {
  return getUserFacingError(error, options).message
}

import 'server-only'

import { isAIUsageControlError } from '@/lib/ai/usage/service'
import { isEntitlementError } from '@/lib/entitlements'

const USAGE_MESSAGES: Array<[string, string]> = [
  ['AI_USAGE_DISABLED', 'AI is currently disabled for your organization.'],
  ['AI_FEATURE_NOT_ALLOWED', 'This AI capability is not enabled for your organization.'],
  ['AI_FEATURE_BLOCKED', 'This AI capability is currently unavailable for your organization.'],
  ['AI_DAILY_REQUEST_LIMIT_REACHED', 'Your organization has reached its daily AI request limit.'],
  ['AI_USER_DAILY_REQUEST_LIMIT_REACHED', 'You have reached your daily AI request limit.'],
  ['AI_MONTHLY_TOKEN_LIMIT_REACHED', 'Your organization has reached its monthly AI token limit.'],
  ['AI_MONTHLY_COST_LIMIT_REACHED', 'Your organization has reached its monthly AI usage limit.'],
  ['AI_CONCURRENCY_LIMIT_REACHED', 'Too many AI requests are currently running. Please try again shortly.'],
  ['USAGE_LIMIT_REACHED', 'Your organization has reached its AI usage limit.'],
]

export function customerAIErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (isEntitlementError(error)) {
    return error.message
  }

  if (isAIUsageControlError(error)) {
    const raw = error.message.toUpperCase()

    for (const [code, message] of USAGE_MESSAGES) {
      if (raw.includes(code)) {
        return message
      }
    }

    return 'AI usage is currently unavailable for this organization.'
  }

  return fallback
}

'use server'

import { revalidatePath } from 'next/cache'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type PlatformSubscriptionActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}


function getFormString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function refreshSubscriptionPages(subscriptionId: string, organizationId: string) {
  revalidatePath('/platform')
  revalidatePath('/platform/subscriptions')
  revalidatePath(`/platform/subscriptions/${subscriptionId}`)
  revalidatePath('/platform/customers')
  revalidatePath(`/platform/customers/${organizationId}`)
  revalidatePath('/platform/organizations')
  revalidatePath(`/platform/organizations/${organizationId}`)
}

export async function schedulePlatformSubscriptionPlanChange(
  _previousState: PlatformSubscriptionActionState,
  formData: FormData,
): Promise<PlatformSubscriptionActionState> {
  await requirePlatformPermission('platform.subscriptions.manage')

  const subscriptionId = getFormString(formData, 'subscriptionId')
  const organizationId = getFormString(formData, 'organizationId')
  const planCode = getFormString(formData, 'planCode')
  const reason = getFormString(formData, 'reason')

  if (!subscriptionId || !organizationId || !planCode) {
    return { status: 'error', message: 'Subscription, organization, and plan are required.' }
  }
  if (reason.length < 10) {
    return { status: 'error', message: 'Enter a reason of at least 10 characters.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_schedule_subscription_plan_change', {
    p_subscription_id: subscriptionId,
    p_plan_code: planCode,
    p_reason: reason,
  })

  if (error) {
    return { status: 'error', message: `Unable to schedule plan change: ${error.message}` }
  }
  if (!data) {
    return { status: 'error', message: 'The plan change was not scheduled.' }
  }

  refreshSubscriptionPages(subscriptionId, organizationId)
  return {
    status: 'success',
    message: 'Plan change scheduled for the current billing-period end. PayMongo payment is still required before activation.',
  }
}

export async function setPlatformSubscriptionCancellation(
  _previousState: PlatformSubscriptionActionState,
  formData: FormData,
): Promise<PlatformSubscriptionActionState> {
  await requirePlatformPermission('platform.subscriptions.manage')

  const subscriptionId = getFormString(formData, 'subscriptionId')
  const organizationId = getFormString(formData, 'organizationId')
  const requestedValue = getFormString(formData, 'cancelAtPeriodEnd')
  const reason = getFormString(formData, 'reason')

  if (!subscriptionId || !organizationId) {
    return { status: 'error', message: 'Subscription and organization are required.' }
  }
  if (requestedValue !== 'true' && requestedValue !== 'false') {
    return { status: 'error', message: 'Invalid cancellation action.' }
  }
  if (reason.length < 10) {
    return { status: 'error', message: 'Enter a reason of at least 10 characters.' }
  }

  const cancelAtPeriodEnd = requestedValue === 'true'
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_set_subscription_cancellation', {
    p_subscription_id: subscriptionId,
    p_cancel_at_period_end: cancelAtPeriodEnd,
    p_reason: reason,
  })

  if (error) {
    return { status: 'error', message: `Unable to update cancellation: ${error.message}` }
  }
  if (!data) {
    return { status: 'error', message: 'The cancellation setting was not changed.' }
  }

  refreshSubscriptionPages(subscriptionId, organizationId)
  return {
    status: 'success',
    message: cancelAtPeriodEnd
      ? 'Cancellation scheduled for the end of the current billing period.'
      : 'Scheduled cancellation revoked. The existing subscription remains active under its current PayMongo lifecycle.',
  }
}

export async function cancelPlatformScheduledPlanChange(
  _previousState: PlatformSubscriptionActionState,
  formData: FormData,
): Promise<PlatformSubscriptionActionState> {
  await requirePlatformPermission('platform.subscriptions.manage')

  const subscriptionId = getFormString(formData, 'subscriptionId')
  const organizationId = getFormString(formData, 'organizationId')
  const reason = getFormString(formData, 'reason')

  if (!subscriptionId || !organizationId) {
    return { status: 'error', message: 'Subscription and organization are required.' }
  }
  if (reason.length < 10) {
    return { status: 'error', message: 'Enter a reason of at least 10 characters.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_cancel_scheduled_plan_change', {
    p_subscription_id: subscriptionId,
    p_reason: reason,
  })

  if (error) {
    return { status: 'error', message: `Unable to cancel scheduled plan change: ${error.message}` }
  }
  if (!data) {
    return { status: 'error', message: 'The scheduled plan change was not cancelled.' }
  }

  refreshSubscriptionPages(subscriptionId, organizationId)
  return { status: 'success', message: 'Scheduled plan change cancelled.' }
}

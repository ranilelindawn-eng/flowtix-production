import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentOrganization } from '@/lib/team'

export type BillingPayment = {
  id: string
  status: string
  amount: number | null
  currency: string
  plan_code: string | null
  provider_payment_id: string | null
  provider_checkout_id: string | null
  paid_at: string | null
  refunded_at: string | null
  failure_message: string | null
  created_at: string
}

export type SubscriptionLifecycleEvent = {
  id: string
  event_type: string
  source: string
  previous_status: string | null
  new_status: string | null
  created_at: string
  metadata: Record<string, unknown>
}

async function requireOwner() {
  const organization = await getCurrentOrganization()
  if (!organization) throw new Error('Authentication is required.')
  if (organization.role !== 'owner') {
    throw new Error('Only the workspace owner can manage the subscription.')
  }
  return organization
}

export async function requestSubscriptionCancellation() {
  const organization = await requireOwner()
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('request_subscription_cancellation', {
    p_organization_id: organization.organization_id,
    p_actor_user_id: organization.user_id,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function reactivateSubscription() {
  const organization = await requireOwner()
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('reactivate_subscription', {
    p_organization_id: organization.organization_id,
    p_actor_user_id: organization.user_id,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function cancelPendingCheckout() {
  const organization = await requireOwner()
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('cancel_pending_paymongo_checkout', {
    p_organization_id: organization.organization_id,
    p_actor_user_id: organization.user_id,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function getBillingHistory(limit = 50): Promise<{
  payments: BillingPayment[]
  lifecycle: SubscriptionLifecycleEvent[]
}> {
  const organization = await getCurrentOrganization()
  if (!organization) return { payments: [], lifecycle: [] }

  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
  const admin = createAdminClient()
  const [paymentsResult, lifecycleResult] = await Promise.all([
    admin
      .from('billing_payments')
      .select('id,status,amount,currency,plan_code,provider_payment_id,provider_checkout_id,paid_at,refunded_at,failure_message,created_at')
      .eq('organization_id', organization.organization_id)
      .order('created_at', { ascending: false })
      .limit(safeLimit),
    admin
      .from('subscription_lifecycle_events')
      .select('id,event_type,source,previous_status,new_status,created_at,metadata')
      .eq('organization_id', organization.organization_id)
      .order('created_at', { ascending: false })
      .limit(safeLimit),
  ])

  if (paymentsResult.error) throw new Error(paymentsResult.error.message)
  if (lifecycleResult.error) throw new Error(lifecycleResult.error.message)

  return {
    payments: (paymentsResult.data ?? []) as BillingPayment[],
    lifecycle: (lifecycleResult.data ?? []) as SubscriptionLifecycleEvent[],
  }
}

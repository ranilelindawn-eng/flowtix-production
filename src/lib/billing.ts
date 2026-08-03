import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

export type PlanCode = 'starter' | 'pro' | 'business' | 'enterprise'

export type SubscriptionPlan = {
  id: string
  code: PlanCode
  name: string
  description: string | null
  monthly_price_cents: number

  stripe_price_id: string | null

  paymongo_price_code: string | null

  max_members: number | null
  max_contacts: number | null
  max_storage_bytes: number | null
  max_calls_per_month: number | null

  sort_order: number
  is_public: boolean
  features: string[]
  is_active: boolean
}

export type OrganizationSubscription = {
  id: string
  organization_id: string
  plan_id: string

  stripe_customer_id: string | null
  stripe_subscription_id: string | null

  paymongo_checkout_id: string | null
  paymongo_payment_id: string | null

  status: string

  current_period_start: string | null
  current_period_end: string | null

  cancel_at_period_end: boolean

  plan: SubscriptionPlan | null
}

export const getPlans = cache(async (): Promise<SubscriptionPlan[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to load subscription plans: ${error.message}`)

  return (data ?? []).map((plan) => ({
    ...plan,
    code: plan.code as PlanCode,
    features: Array.isArray(plan.features) ? plan.features.filter((item: unknown): item is string => typeof item === 'string') : [],
  }))
})

export const getCurrentSubscription = cache(async (): Promise<OrganizationSubscription | null> => {
  const organization = await getCurrentOrganization()
  if (!organization) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_subscriptions')
    .select('*, plan:subscription_plans(*)')
    .eq('organization_id', organization.organization_id)
    .maybeSingle()

  if (error) throw new Error(`Failed to load subscription: ${error.message}`)
  if (!data) return null

  const plan = Array.isArray(data.plan) ? data.plan[0] ?? null : data.plan
  return {
    ...data,
    plan: plan ? {
      ...plan,
      code: plan.code as PlanCode,
      features: Array.isArray(plan.features) ? plan.features.filter((item: unknown): item is string => typeof item === 'string') : [],
    } : null,
  }
})

import { cache } from 'react'

import type { PlanCode as CanonicalPlanCode } from '@/lib/plans/catalog'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

export type PlanCode = CanonicalPlanCode

export type SubscriptionPlan = {
  id: string
  code: PlanCode
  name: string
  description: string | null
  monthly_price_cents: number
  billing_provider: 'paymongo'
  provider_price_code: string | null
  paymongo_price_code: string | null
  max_members: number | null
  max_contacts: number | null
  max_storage_bytes: number | null
  max_calls_per_month: number | null
  public_price_usd_cents: number | null
  max_active_campaigns: number | null
  max_active_sequences: number | null
  recording_retention_days: number | null
  max_transcription_minutes_per_month: number | null
  sort_order: number
  is_public: boolean
  features: string[]
  is_active: boolean
}

export type OrganizationSubscription = {
  id: string
  organization_id: string
  plan_id: string
  billing_provider: 'paymongo'
  provider_customer_id: string | null
  provider_subscription_id: string | null
  provider_checkout_id: string | null
  provider_payment_id: string | null
  paymongo_checkout_id: string | null
  paymongo_payment_id: string | null
  paymongo_plan_code: PlanCode | null
  status: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  last_billing_event_at: string | null
  billing_metadata: Record<string, unknown>
  pending_plan_id: string | null
  pending_checkout_expires_at: string | null
  scheduled_plan_id: string | null
  scheduled_plan_effective_at: string | null
  lifecycle_version: number
  activated_at: string | null
  cancelled_at: string | null
  grace_period_ends_at: string | null
  payment_failure_count: number
  last_payment_status: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  trial_converted_at: string | null
  plan: SubscriptionPlan | null
}

export const getPlans = cache(
  async (): Promise<SubscriptionPlan[]> => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .eq('is_public', true)
      .order('sort_order', {
        ascending: true,
      })

    if (error) {
      throw new Error(
        `Failed to load subscription plans: ${error.message}`,
      )
    }

    return (data ?? []).map((plan) => ({
      ...plan,
      code: plan.code as PlanCode,
      features: Array.isArray(plan.features)
        ? plan.features.filter(
            (item: unknown): item is string =>
              typeof item === 'string',
          )
        : [],
    }))
  },
)

export const getCurrentSubscription = cache(
  async (): Promise<OrganizationSubscription | null> => {
    const organization =
      await getCurrentOrganization()

    if (!organization) {
      return null
    }

    const supabase = await createClient()

    const { data: subscription, error } = await supabase
      .from('organization_subscriptions')
      .select('*')
      .eq(
        'organization_id',
        organization.organization_id,
      )
      .maybeSingle()

    if (error) {
      throw new Error(
        `Failed to load subscription: ${error.message}`,
      )
    }

    if (!subscription) {
      return null
    }

    let plan: SubscriptionPlan | null = null

    if (subscription.plan_id) {
      const { data: planData, error: planError } =
        await supabase
          .from('subscription_plans')
          .select('*')
          .eq('id', subscription.plan_id)
          .maybeSingle()

      if (planError) {
        throw new Error(
          `Failed to load subscription plan: ${planError.message}`,
        )
      }

      if (planData) {
        plan = {
          ...planData,
          code: planData.code as PlanCode,
          billing_provider: 'paymongo',
          features: Array.isArray(planData.features)
            ? planData.features.filter(
                (
                  item: unknown,
                ): item is string =>
                  typeof item === 'string',
              )
            : [],
        }
      }
    }

    return {
      ...subscription,
      billing_provider: 'paymongo',
      paymongo_plan_code:
        typeof subscription.paymongo_plan_code === 'string'
          ? (subscription.paymongo_plan_code as PlanCode)
          : null,
      plan,
    }
  },
)
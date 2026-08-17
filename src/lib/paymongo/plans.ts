import 'server-only'

import {
  FLOWTIX_PLAN_CODES,
  normalizePlanCode,
  type PlanCode,
} from '@/lib/plans/catalog'
import { createAdminClient } from '@/lib/supabase/admin'

export const PAYMONGO_PLAN_CODES = FLOWTIX_PLAN_CODES
export type PayMongoPlanCode = PlanCode

export type PayMongoPlan = {
  id: string
  code: PayMongoPlanCode
  name: string
  description: string | null
  amount: number
  sortOrder: number
  providerPriceCode: string
}

export function normalizePayMongoPlanCode(
  value: string,
): PayMongoPlanCode | null {
  return normalizePlanCode(value)
}

export async function getPayMongoPlan(
  value: string,
): Promise<PayMongoPlan | null> {
  const code = normalizePayMongoPlanCode(value)

  if (!code) {
    return null
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('subscription_plans')
    .select(
      'id,code,name,description,monthly_price_cents,sort_order,billing_provider,provider_price_code,is_active,is_public',
    )
    .eq('code', code)
    .eq('billing_provider', 'paymongo')
    .eq('is_active', true)
    .eq('is_public', true)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Unable to load PayMongo plan: ${error.message}`,
    )
  }

  if (!data || data.monthly_price_cents <= 0) {
    return null
  }

  return {
    id: data.id,
    code: data.code as PayMongoPlanCode,
    name: data.name,
    description: data.description,
    amount: data.monthly_price_cents,
    sortOrder: data.sort_order,
    providerPriceCode:
      data.provider_price_code?.trim() || data.code,
  }
}

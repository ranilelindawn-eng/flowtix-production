import 'server-only'

import { requirePermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentOrganization } from '@/lib/team'

export type BillingInvoice = {
  id: string
  invoice_number: string
  status: string
  currency: string
  subtotal: number
  tax: number
  total: number
  amount_paid: number
  amount_due: number
  period_start: string | null
  period_end: string | null
  due_at: string | null
  paid_at: string | null
  line_items: unknown[]
  created_at: string
}

export type UsageBillingStatement = {
  id: string
  period_start: string
  period_end: string
  status: string
  currency: string
  subtotal: number
  line_items: unknown[]
  invoice_id: string | null
  created_at: string
}

async function requireOwnerOrganization() {
  const organization = await getCurrentOrganization()
  if (!organization) throw new Error('Organization not found.')
  if (organization.role !== 'owner') {
    throw new Error('Only the workspace owner can manage billing.')
  }
  return organization
}

export async function schedulePlanChange(planCode: string, effective: 'immediate' | 'period_end') {
  const organization = await requireOwnerOrganization()
  const { data, error } = await createAdminClient().rpc('schedule_subscription_plan_change', {
    p_organization_id: organization.organization_id,
    p_actor_user_id: organization.user_id,
    p_plan_code: planCode,
    p_effective: effective,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function getInvoices(limit = 100): Promise<BillingInvoice[]> {
  await requirePermission('billing.view')
  const organization = await getCurrentOrganization()
  if (!organization) return []
  const { data, error } = await createAdminClient()
    .from('billing_invoices')
    .select('id,invoice_number,status,currency,subtotal,tax,total,amount_paid,amount_due,period_start,period_end,due_at,paid_at,line_items,created_at')
    .eq('organization_id', organization.organization_id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as BillingInvoice[]
}

export async function getUsageBillingStatements(limit = 24): Promise<UsageBillingStatement[]> {
  await requirePermission('billing.view')
  const organization = await getCurrentOrganization()
  if (!organization) return []
  const { data, error } = await createAdminClient()
    .from('usage_billing_statements')
    .select('id,period_start,period_end,status,currency,subtotal,line_items,invoice_id,created_at')
    .eq('organization_id', organization.organization_id)
    .order('period_start', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as UsageBillingStatement[]
}

export async function calculateCurrentUsageStatement() {
  const organization = await requireOwnerOrganization()
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const { data, error } = await createAdminClient().rpc('calculate_usage_billing_statement', {
    p_organization_id: organization.organization_id,
    p_period_start: start.toISOString().slice(0, 10),
    p_period_end: end.toISOString().slice(0, 10),
  })
  if (error) throw new Error(error.message)
  return data
}

export async function replayWebhookEvent(eventId: string) {
  const organization = await requireOwnerOrganization()
  const { data, error } = await createAdminClient().rpc('replay_billing_webhook_event', {
    p_event_uuid: eventId,
    p_actor_user_id: organization.user_id,
  })
  if (error) throw new Error(error.message)
  return data
}

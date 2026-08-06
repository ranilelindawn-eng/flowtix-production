import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js'

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type ContactInquiryRow = {
  id: string
  name: string
  email: string
  topic: string
  message: string
  ip_address: string | null
  user_agent: string | null
  delivery_status: string
  delivery_error: string | null
  delivered_at: string | null
  created_at: string
}

type ContactInquiryInsert = {
  id?: string
  name: string
  email: string
  topic: string
  message: string
  ip_address?: string | null
  user_agent?: string | null
  delivery_status?: string
  delivery_error?: string | null
  delivered_at?: string | null
  created_at?: string
}

type OrganizationMemberRow = {
  id: string
  organization_id: string
  user_id: string
  role: string
  status: string | null
  created_at: string
}

type OrganizationSubscriptionRow = {
  id: string
  organization_id: string
  plan_id: string
  status: string
  billing_provider: string
  paymongo_checkout_id: string | null
  paymongo_plan_code: string | null
  paymongo_payment_id: string | null
  provider_customer_id: string | null
  provider_subscription_id: string | null
  provider_checkout_id: string | null
  provider_payment_id: string | null
  last_billing_event_at: string | null
  billing_metadata: Json
  pending_plan_id: string | null
  pending_checkout_expires_at: string | null
  activated_at: string | null
  cancelled_at: string | null
  grace_period_ends_at: string | null
  payment_failure_count: number
  last_payment_status: string | null
}

type SubscriptionPlanRow = {
  id: string
  code: string
  name: string
  description: string | null
  monthly_price_cents: number
  billing_provider: string
  provider_price_code: string | null
  paymongo_price_code: string | null
  max_members: number | null
  max_contacts: number | null
  max_storage_bytes: number | null
  max_calls_per_month: number | null
  max_ai_requests_per_month: number | null
  max_emails_per_month: number | null
  max_sms_per_month: number | null
  max_phone_numbers: number | null
  max_api_keys: number | null
  sort_order: number
  is_public: boolean
  features: Json
  entitlements: Json
  is_active: boolean
  created_at: string
  updated_at: string
}

type BillingPaymentEventRow = {
  id: string
  organization_id: string | null
  provider: string
  provider_event_id: string
  event_type: string
  status: string
  payload: Json
  received_at: string
  processed_at: string | null
}


type BillingPaymentRow = {
  id: string
  organization_id: string
  subscription_id: string | null
  provider: string
  provider_payment_id: string | null
  provider_checkout_id: string | null
  provider_event_id: string | null
  plan_id: string | null
  plan_code: string | null
  status: string
  amount: number | null
  currency: string
  failure_code: string | null
  failure_message: string | null
  paid_at: string | null
  refunded_at: string | null
  created_at: string
  updated_at: string
  metadata: Json
}

type SubscriptionLifecycleEventRow = {
  id: string
  organization_id: string
  subscription_id: string | null
  event_type: string
  source: string
  previous_status: string | null
  new_status: string | null
  plan_id: string | null
  provider_event_id: string | null
  actor_user_id: string | null
  metadata: Json
  created_at: string
}


type BillingInvoiceRow = {
  id: string
  organization_id: string
  subscription_id: string | null
  payment_id: string | null
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
  voided_at: string | null
  line_items: Json
  billing_details: Json
  metadata: Json
  created_at: string
  updated_at: string
}

type UsageBillingStatementRow = {
  id: string
  organization_id: string
  subscription_id: string | null
  period_start: string
  period_end: string
  status: string
  currency: string
  subtotal: number
  line_items: Json
  invoice_id: string | null
  finalized_at: string | null
  created_at: string
  updated_at: string
}

type BillingWebhookAttemptRow = {
  id: string
  billing_event_id: string
  attempt_number: number
  outcome: string
  error_message: string | null
  duration_ms: number | null
  created_at: string
}

type Database = {
  public: {
    Tables: {
      organization_members: {
        Row: OrganizationMemberRow
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role: string
          status?: string | null
          created_at?: string
        }
        Update: Partial<OrganizationMemberRow>
        Relationships: []
      }
      organization_subscriptions: {
        Row: OrganizationSubscriptionRow
        Insert: {
          id?: string
          organization_id: string
          plan_id: string
          status?: string
          billing_provider?: string
          paymongo_checkout_id?: string | null
          paymongo_plan_code?: string | null
          paymongo_payment_id?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          provider_checkout_id?: string | null
          provider_payment_id?: string | null
          last_billing_event_at?: string | null
          billing_metadata?: Json
          pending_plan_id?: string | null
          pending_checkout_expires_at?: string | null
          activated_at?: string | null
          cancelled_at?: string | null
          grace_period_ends_at?: string | null
          payment_failure_count?: number
          last_payment_status?: string | null
        }
        Update: Partial<OrganizationSubscriptionRow>
        Relationships: []
      }
      subscription_plans: {
        Row: SubscriptionPlanRow
        Insert: {
          id?: string
          code: string
          name: string
          description?: string | null
          monthly_price_cents?: number
          billing_provider?: string
          provider_price_code?: string | null
          paymongo_price_code?: string | null
          max_members?: number | null
          max_contacts?: number | null
          max_storage_bytes?: number | null
          max_calls_per_month?: number | null
          max_ai_requests_per_month?: number | null
          max_emails_per_month?: number | null
          max_sms_per_month?: number | null
          max_phone_numbers?: number | null
          max_api_keys?: number | null
          sort_order?: number
          is_public?: boolean
          features?: Json
          entitlements?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<SubscriptionPlanRow>
        Relationships: []
      }
      billing_payment_events: {
        Row: BillingPaymentEventRow
        Insert: Omit<BillingPaymentEventRow, 'id' | 'received_at' | 'processed_at'> & {
          id?: string
          received_at?: string
          processed_at?: string | null
        }
        Update: Partial<BillingPaymentEventRow>
        Relationships: []
      }
      billing_payments: {
        Row: BillingPaymentRow
        Insert: Partial<BillingPaymentRow> & Pick<BillingPaymentRow, 'organization_id'>
        Update: Partial<BillingPaymentRow>
        Relationships: []
      }
      subscription_lifecycle_events: {
        Row: SubscriptionLifecycleEventRow
        Insert: Partial<SubscriptionLifecycleEventRow> & Pick<SubscriptionLifecycleEventRow, 'organization_id' | 'event_type' | 'source'>
        Update: Partial<SubscriptionLifecycleEventRow>
        Relationships: []
      }
      billing_invoices: {
        Row: BillingInvoiceRow
        Insert: Partial<BillingInvoiceRow> & Pick<BillingInvoiceRow, 'organization_id'>
        Update: Partial<BillingInvoiceRow>
        Relationships: []
      }
      usage_billing_statements: {
        Row: UsageBillingStatementRow
        Insert: Partial<UsageBillingStatementRow> & Pick<UsageBillingStatementRow, 'organization_id' | 'period_start' | 'period_end'>
        Update: Partial<UsageBillingStatementRow>
        Relationships: []
      }
      billing_webhook_attempts: {
        Row: BillingWebhookAttemptRow
        Insert: Partial<BillingWebhookAttemptRow> & Pick<BillingWebhookAttemptRow, 'billing_event_id' | 'attempt_number' | 'outcome'>
        Update: Partial<BillingWebhookAttemptRow>
        Relationships: []
      }
      contact_inquiries: {
        Row: ContactInquiryRow
        Insert: ContactInquiryInsert
        Update: Partial<ContactInquiryInsert>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      begin_idempotent_request: {
        Args: {
          target_org: string
          operation_scope: string
          operation_key: string
          request_fingerprint: string
          ttl_seconds?: number
        }
        Returns: Array<{
          action: 'acquired' | 'replay' | 'conflict' | 'in_progress'
          record_id: string
          response_status: number | null
          response_body: Record<string, unknown> | null
        }>
      }
      complete_idempotent_request: {
        Args: {
          target_record: string
          result_status: number
          result_body?: Record<string, unknown>
          result_resource_type?: string | null
          result_resource_id?: string | null
        }
        Returns: undefined
      }
      fail_idempotent_request: {
        Args: {
          target_record: string
          failure_status?: number
          failure_message?: string | null
          failure_body?: Record<string, unknown> | null
        }
        Returns: undefined
      }
      process_paymongo_webhook_event: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_livemode: boolean | null
          p_signature_timestamp: string
          p_resource_type: string | null
          p_resource_id: string | null
          p_organization_id: string | null
          p_checkout_id: string | null
          p_payment_id: string | null
          p_plan_code: string | null
          p_payload: Json
        }
        Returns: Record<string, unknown>
      }
      schedule_subscription_plan_change: {
        Args: { p_organization_id: string; p_actor_user_id: string; p_plan_code: string; p_effective?: string }
        Returns: Record<string, unknown>
      }
      process_subscription_renewals: {
        Args: Record<string, never>
        Returns: number
      }
      generate_invoice_for_payment: {
        Args: { p_payment_id: string }
        Returns: string
      }
      calculate_usage_billing_statement: {
        Args: { p_organization_id: string; p_period_start: string; p_period_end: string }
        Returns: string
      }
      mark_billing_webhook_attempt: {
        Args: { p_event_id: string; p_outcome: string; p_error?: string | null; p_duration_ms?: number | null }
        Returns: Record<string, unknown>
      }
      replay_billing_webhook_event: {
        Args: { p_event_uuid: string; p_actor_user_id: string }
        Returns: Record<string, unknown>
      }
      request_subscription_cancellation: {
        Args: { p_organization_id: string; p_actor_user_id: string }
        Returns: Record<string, unknown>
      }
      reactivate_subscription: {
        Args: { p_organization_id: string; p_actor_user_id: string }
        Returns: Record<string, unknown>
      }
      cancel_pending_paymongo_checkout: {
        Args: { p_organization_id: string; p_actor_user_id: string }
        Returns: Record<string, unknown>
      }
      expire_pending_paymongo_checkouts: {
        Args: Record<string, never>
        Returns: number
      }
      process_paymongo_lifecycle_event: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_livemode: boolean | null
          p_signature_timestamp: string
          p_resource_type: string | null
          p_resource_id: string | null
          p_organization_id: string | null
          p_checkout_id: string | null
          p_payment_id: string | null
          p_plan_code: string | null
          p_amount: number | null
          p_currency: string | null
          p_payment_status: string | null
          p_failure_code: string | null
          p_failure_message: string | null
          p_payload: Json
        }
        Returns: Record<string, unknown>
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

let adminClient: SupabaseClient<Database> | undefined

export function createAdminClient(): SupabaseClient<Database> {
  if (adminClient) return adminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase service-role configuration.')
  }

  adminClient = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminClient
}
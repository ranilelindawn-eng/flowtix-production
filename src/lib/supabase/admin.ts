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
}

type SubscriptionPlanRow = {
  id: string
  code: string
  name: string
  billing_provider: string
  provider_price_code: string | null
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
          billing_provider?: string
          provider_price_code?: string | null
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

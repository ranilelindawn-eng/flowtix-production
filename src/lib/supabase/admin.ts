import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js'

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

type ContactInquiryUpdate = Partial<ContactInquiryInsert>

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
  paymongo_checkout_id: string | null
  paymongo_plan_code: string | null
  paymongo_payment_id: string | null
}

type SubscriptionPlanRow = {
  id: string
  code: string
  name: string
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
        Update: {
          organization_id?: string
          user_id?: string
          role?: string
          status?: string | null
        }
        Relationships: []
      }

      organization_subscriptions: {
        Row: OrganizationSubscriptionRow
        Insert: {
          id?: string
          organization_id: string
          plan_id: string
          status?: string
          paymongo_checkout_id?: string | null
          paymongo_plan_code?: string | null
          paymongo_payment_id?: string | null
        }
        Update: {
          organization_id?: string
          plan_id?: string
          status?: string
          paymongo_checkout_id?: string | null
          paymongo_plan_code?: string | null
          paymongo_payment_id?: string | null
        }
        Relationships: []
      }

      subscription_plans: {
        Row: SubscriptionPlanRow
        Insert: {
          id?: string
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }

      contact_inquiries: {
        Row: ContactInquiryRow
        Insert: ContactInquiryInsert
        Update: ContactInquiryUpdate
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
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

let adminClient: SupabaseClient<Database> | undefined

export function createAdminClient(): SupabaseClient<Database> {
  if (adminClient) {
    return adminClient
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase service-role configuration.',
    )
  }

  adminClient = createClient<Database>(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )

  return adminClient
}
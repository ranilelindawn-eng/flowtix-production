import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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

type Database = {
  public: {
    Tables: {
      contact_inquiries: {
        Row: ContactInquiryRow
        Insert: ContactInquiryInsert
        Update: ContactInquiryUpdate
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
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

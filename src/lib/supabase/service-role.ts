import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let serviceRoleClient: SupabaseClient | undefined

export function createServiceRoleClient(): SupabaseClient {
  if (serviceRoleClient) return serviceRoleClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase service-role configuration.')
  }

  serviceRoleClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return serviceRoleClient
}

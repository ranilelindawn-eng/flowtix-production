import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let recoveryClient:
  | ReturnType<typeof createSupabaseClient>
  | undefined

export function createRecoveryClient() {
  if (recoveryClient) {
    return recoveryClient
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL

  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL environment variable.',
    )
  }

  if (!supabasePublishableKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.',
    )
  }

  recoveryClient = createSupabaseClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        flowType: 'implicit',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    },
  )

  return recoveryClient
}
import { createClient } from '@supabase/supabase-js'

export function createTelephonyAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('Missing Supabase service role configuration.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

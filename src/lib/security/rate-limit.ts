import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function enforceRateLimit(
  key: string,
  limit = 10,
  windowSeconds = 60,
) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_bucket_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })

  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`)
  }

  if (data !== true) {
    throw new Error('Too many requests. Please wait and try again.')
  }
}

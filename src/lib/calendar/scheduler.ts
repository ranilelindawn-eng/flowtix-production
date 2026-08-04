import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service-role configuration for the calendar scheduler.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function schedulePendingCalendarSync(
  limit = 100,
) {
  const client = serviceClient()
  const { data, error } = await client.rpc(
    'enqueue_pending_calendar_sync_jobs',
    {
      p_limit: Math.max(1, Math.min(limit, 500)),
    },
  )

  if (error) {
    throw new Error(
      `Unable to schedule pending calendar synchronization: ${error.message}`,
    )
  }

  return {
    scheduled: Number(data ?? 0),
  }
}

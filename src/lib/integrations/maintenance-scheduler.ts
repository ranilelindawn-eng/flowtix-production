import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service-role configuration for integration scheduling.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function scheduleIntegrationMaintenance(
  limit = 100,
) {
  const client = serviceClient()
  const { data, error } = await client.rpc(
    'enqueue_due_integration_maintenance_jobs',
    {
      p_limit: Math.max(1, Math.min(limit, 500)),
    },
  )

  if (error) {
    throw new Error(
      `Unable to schedule integration maintenance: ${error.message}`,
    )
  }

  const result =
    data && typeof data === 'object'
      ? data as Record<string, unknown>
      : {}

  return {
    refreshScheduled: Number(
      result.refresh_scheduled ?? 0,
    ),
    healthScheduled: Number(
      result.health_scheduled ?? 0,
    ),
    skipped: Number(result.skipped ?? 0),
  }
}

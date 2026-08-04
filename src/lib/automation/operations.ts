import { createClient } from '@supabase/supabase-js'

import { DeferredJobError } from '@/lib/jobs/types'

export type AutomationArea =
  | 'communications'
  | 'sequences'
  | 'campaigns'

export type AutomationControl = {
  organization_id: string
  global_paused: boolean
  communications_paused: boolean
  sequences_paused: boolean
  campaigns_paused: boolean
  pause_reason: string | null
  updated_at: string
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service-role configuration for automation operations.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function areaPaused(
  control: AutomationControl,
  area: AutomationArea,
) {
  if (control.global_paused) {
    return true
  }

  if (area === 'communications') {
    return control.communications_paused
  }

  if (area === 'sequences') {
    return control.sequences_paused
  }

  return control.campaigns_paused
}

export async function getAutomationControl(
  organizationId: string,
): Promise<AutomationControl> {
  const client = createServiceClient()
  const { data, error } = await client
    .from('automation_controls')
    .select(
      'organization_id,global_paused,communications_paused,sequences_paused,campaigns_paused,pause_reason,updated_at',
    )
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Unable to load automation controls: ${error.message}`,
    )
  }

  if (data) {
    return data as AutomationControl
  }

  const { data: created, error: createError } = await client
    .from('automation_controls')
    .insert({ organization_id: organizationId })
    .select(
      'organization_id,global_paused,communications_paused,sequences_paused,campaigns_paused,pause_reason,updated_at',
    )
    .single()

  if (createError) {
    throw new Error(
      `Unable to initialize automation controls: ${createError.message}`,
    )
  }

  return created as AutomationControl
}

export async function isAutomationPaused(
  organizationId: string,
  area: AutomationArea,
): Promise<{
  paused: boolean
  reason: string | null
}> {
  const control = await getAutomationControl(organizationId)

  return {
    paused: areaPaused(control, area),
    reason: control.pause_reason,
  }
}

export async function assertAutomationEnabled(
  organizationId: string,
  area: AutomationArea,
): Promise<void> {
  const state = await isAutomationPaused(organizationId, area)

  if (!state.paused) {
    return
  }

  throw new DeferredJobError(
    state.reason?.trim() ||
      `${area} automation is currently paused by an administrator.`,
    new Date(Date.now() + 5 * 60 * 1000),
    'AUTOMATION_PAUSED',
  )
}

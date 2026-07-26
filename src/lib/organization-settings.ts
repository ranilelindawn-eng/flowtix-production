import { cache } from 'react'

import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

export type OrganizationSettings = {
  id: string
  name: string
  logo_url: string | null
  timezone: string
  business_hours: Record<string, unknown>
  recording_enabled: boolean
  transcription_enabled: boolean
  transcription_language: string
  ai_provider:
    | 'manual'
    | 'openai'
    | 'anthropic'
    | 'google'
    | 'deepseek'
    | 'other'
  ai_model: string | null
  created_at: string
  updated_at: string
}

export const getOrganizationSettings = cache(
  async (): Promise<OrganizationSettings | null> => {
    const organization = await getCurrentOrganization()

    if (!organization) {
      return null
    }

    const supabase = await createServerSupabaseClient()

    if (!supabase) {
      return null
    }

    const { data, error } = await supabase
      .from('organizations')
      .select(`
        id,
        name,
        logo_url,
        timezone,
        business_hours,
        recording_enabled,
        transcription_enabled,
        transcription_language,
        ai_provider,
        ai_model,
        created_at,
        updated_at
      `)
      .eq('id', organization.organization_id)
      .maybeSingle()

    if (error) {
      throw new Error(
        `Failed to load organization settings: ${error.message}`
      )
    }

    if (!data) {
      return null
    }

    return data as OrganizationSettings
  }
)

export async function updateOrganizationSettings(
  values: Partial<
    Pick<
      OrganizationSettings,
      | 'name'
      | 'logo_url'
      | 'timezone'
      | 'business_hours'
      | 'recording_enabled'
      | 'transcription_enabled'
      | 'transcription_language'
      | 'ai_provider'
      | 'ai_model'
    >
  >
) {
  const organization = await getCurrentOrganization()

  if (!organization) {
    throw new Error('Organization not found.')
  }

  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    throw new Error('Unable to connect to Supabase.')
  }

  const { error } = await supabase
    .from('organizations')
    .update(values)
    .eq('id', organization.organization_id)

  if (error) {
    throw new Error(
      `Failed to update organization settings: ${error.message}`
    )
  }
}
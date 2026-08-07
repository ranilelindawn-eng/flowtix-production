import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCurrentOrganization, type TeamRole } from '@/lib/team'
import { hasPermission } from '@/lib/permissions'

export type SettingsContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>
  userId: string
  organizationId: string
  role: TeamRole
}

export async function requireSettingsContext(): Promise<SettingsContext> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) throw new Error('Unable to connect to Supabase.')

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('You must be signed in.')
  }

  const membership = await getCurrentOrganization()

  if (!membership || membership.user_id !== user.id) {
    throw new Error('No active organization membership found.')
  }

  return {
    supabase,
    userId: user.id,
    organizationId: membership.organization_id,
    role: membership.role,
  }
}

export function canManageSettings(role: TeamRole): boolean {
  return hasPermission(role, 'settings.manage')
}

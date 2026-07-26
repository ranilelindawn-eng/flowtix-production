import { createServerSupabaseClient } from '@/lib/supabase/server'

export type SettingsContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>
  userId: string
  organizationId: string
  role: string
}

export async function requireSettingsContext(): Promise<SettingsContext> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) throw new Error('Unable to connect to Supabase.')

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('You must be signed in.')

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membershipError || !membership) throw new Error('No active organization membership found.')

  return {
    supabase,
    userId: user.id,
    organizationId: membership.organization_id,
    role: membership.role,
  }
}

export function canManageSettings(role: string) {
  return role === 'owner' || role === 'admin'
}

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization, getTeamMembers } from '@/lib/team'

export type AttendanceEntry = {
  id: string
  organization_id: string
  user_id: string
  clocked_in_at: string
  clocked_out_at: string | null
  created_at: string
  updated_at: string
}

export type AttendanceMember = {
  user_id: string
  full_name: string | null
  email: string | null
  role: string
  is_active: boolean
  active_since: string | null
  entries: AttendanceEntry[]
}

export async function getAttendanceDashboard(
  canViewAll: boolean,
): Promise<{
  currentUserId: string
  ownOpenEntry: AttendanceEntry | null
  members: AttendanceMember[]
}> {
  const organization = await getCurrentOrganization()

  if (!organization) {
    throw new Error('Organization not found.')
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('You must be signed in.')
  }

  const since = new Date()
  since.setDate(since.getDate() - 30)

  let query = supabase
    .from('attendance_entries')
    .select(
      'id, organization_id, user_id, clocked_in_at, clocked_out_at, created_at, updated_at',
    )
    .eq('organization_id', organization.organization_id)
    .or(
      `clocked_out_at.is.null,clocked_in_at.gte.${since.toISOString()}`,
    )
    .order('clocked_in_at', { ascending: false })

  if (!canViewAll) {
    query = query.eq('user_id', user.id)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to load attendance: ${error.message}`)
  }

  const entries = (data ?? []) as AttendanceEntry[]
  const ownOpenEntry =
    entries.find(
      (entry) => entry.user_id === user.id && !entry.clocked_out_at,
    ) ?? null

  const teamMembers = canViewAll
    ? await getTeamMembers()
    : (await getTeamMembers()).filter(
        (member) => member.user_id === user.id,
      )

  const members = teamMembers.map((member) => {
    const memberEntries = entries.filter(
      (entry) => entry.user_id === member.user_id,
    )
    const openEntry = memberEntries.find(
      (entry) => !entry.clocked_out_at,
    )

    return {
      user_id: member.user_id,
      full_name: member.profile?.full_name ?? null,
      email: member.profile?.email ?? null,
      role: member.role,
      is_active: Boolean(openEntry),
      active_since: openEntry?.clocked_in_at ?? null,
      entries: memberEntries,
    }
  })

  return {
    currentUserId: user.id,
    ownOpenEntry,
    members,
  }
}

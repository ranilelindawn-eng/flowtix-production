import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

export const CALENDAR_VISIBILITIES = ['private', 'team', 'organization'] as const
export type CalendarVisibility = (typeof CALENDAR_VISIBILITIES)[number]

export type CalendarConflict = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  owner_id: string | null
}

export async function findCalendarConflicts(input: {
  startsAt: string
  endsAt: string
  ownerId?: string | null
  excludeEventId?: string | null
}): Promise<CalendarConflict[]> {
  const membership = await getCurrentOrganization()
  if (!membership) throw new Error('An active organization is required.')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('find_calendar_conflicts', {
    p_organization_id: membership.organization_id,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_owner_id: input.ownerId ?? null,
    p_exclude_event_id: input.excludeEventId ?? null,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as CalendarConflict[]
}

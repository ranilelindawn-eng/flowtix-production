'use server'

import { revalidatePath } from 'next/cache'

import { requirePermission } from '@/lib/auth'
import {
  createTeamsMeeting,
  deleteTeamsMeeting,
  updateTeamsMeeting,
} from '@/lib/integrations/teams-client'
import {
  createZoomMeeting,
  deleteZoomMeeting,
  updateZoomMeeting,
} from '@/lib/integrations/zoom-client'
import { enqueueJob } from '@/lib/jobs/queue'
import { resolveOwnerAssignmentByUserId } from '@/lib/ownership'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

const EDIT_ALL_ROLES = new Set(['owner', 'admin'])
const EDIT_TEAM_ROLES = new Set(['owner', 'admin', 'manager'])

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim()
}

function optionalId(formData: FormData, key: string) {
  const value = text(formData, key)
  return value.length > 0 ? value : null
}

function bool(formData: FormData, key: string) {
  return formData.get(key) === 'on' || formData.get(key) === 'true'
}

async function context() {
  const supabase = await createClient()
  const { data: claimsData, error } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  const membership = await getCurrentOrganization()

  if (error || typeof userId !== 'string' || !membership) {
    throw new Error('You must be signed in to manage calendar events.')
  }

  return {
    supabase,
    userId,
    organizationId: membership.organization_id,
    role: membership.role,
    membership,
  }
}

function parseTimes(formData: FormData) {
  const start = new Date(text(formData, 'starts_at'))
  const end = new Date(text(formData, 'ends_at'))

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Enter a valid start and end time.')
  }

  if (end <= start) {
    throw new Error('The end time must be after the start time.')
  }

  return { start, end }
}

async function queueCalendarSync(input: {
  organizationId: string
  eventId: string
  revision: number
  action: 'upsert' | 'delete'
}) {
  return enqueueJob({
    organizationId: input.organizationId,
    queue: 'calendar_sync',
    jobType: 'calendar.sync_event',
    payload: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      revision: input.revision,
      action: input.action,
    },
    priority: 70,
    maxAttempts: 8,
    idempotencyKey:
      `calendar-sync:${input.eventId}:${input.revision}:${input.action}`,
  })
}

export async function createCalendarEvent(
  formData: FormData,
): Promise<void> {
  await requirePermission('calendar.create')
  const {
    supabase,
    userId,
    organizationId,
    membership,
  } = await context()
  const { start, end } = parseTimes(formData)
  const title = text(formData, 'title')
  const eventType = text(formData, 'event_type') || 'meeting'
  const meetingProvider =
    text(formData, 'meeting_provider') || 'none'
  const timezone = text(formData, 'timezone') || 'Asia/Manila'
  const description = text(formData, 'description')
  const attendeeEmails = text(formData, 'attendee_emails')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (!title) {
    throw new Error('Event title is required.')
  }

  const owner = await resolveOwnerAssignmentByUserId(
    membership,
    optionalId(formData, 'owner_id'),
  )

  let externalMeetingId: string | null = null
  let meetingUrl: string | null =
    text(formData, 'meeting_url') || null
  let hostUrl: string | null = null
  let meetingPassword: string | null = null

  if (meetingProvider === 'zoom') {
    const zoom = await createZoomMeeting(organizationId, {
      topic: title,
      agenda: description,
      startTime: start,
      durationMinutes: Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / 60_000),
      ),
      timezone,
      attendeeEmails,
    })
    externalMeetingId = String(zoom.id)
    meetingUrl = zoom.join_url
    hostUrl = zoom.start_url ?? null
    meetingPassword = zoom.password ?? null
  } else if (meetingProvider === 'teams') {
    const teams = await createTeamsMeeting(organizationId, {
      subject: title,
      startTime: start,
      endTime: end,
      attendeeEmails,
    })
    externalMeetingId = teams.id
    meetingUrl = teams.joinWebUrl
  }

  const syncGoogle = bool(formData, 'sync_google_calendar')
  const revision = 1

  const { data: created, error } = await supabase
    .from('calendar_events')
    .insert({
      organization_id: organizationId,
      title,
      description: description || null,
      event_type: eventType,
      status: 'scheduled',
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      timezone,
      all_day: bool(formData, 'all_day'),
      location: text(formData, 'location') || null,
      meeting_provider: meetingProvider,
      external_meeting_id: externalMeetingId,
      meeting_url: meetingUrl,
      host_url: hostUrl,
      meeting_password: meetingPassword,
      contact_id: optionalId(formData, 'contact_id'),
      company_id: optionalId(formData, 'company_id'),
      opportunity_id: optionalId(formData, 'opportunity_id'),
      owner_id: owner.ownerUserId,
      owner_membership_id: owner.ownerMembershipId,
      created_by: userId,
      attendee_emails: attendeeEmails,
      metadata: {},
      calendar_sync_provider: syncGoogle
        ? 'google-calendar'
        : 'none',
      calendar_sync_status: syncGoogle
        ? 'pending'
        : 'disabled',
      calendar_sync_revision: revision,
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(
      error?.message || 'Unable to create the calendar event.',
    )
  }

  if (syncGoogle) {
    try {
      const job = await queueCalendarSync({
        organizationId,
        eventId: created.id,
        revision,
        action: 'upsert',
      })

      await supabase
        .from('calendar_events')
        .update({ calendar_sync_job_id: job.id })
        .eq('organization_id', organizationId)
        .eq('id', created.id)
    } catch (queueError) {
      console.error('Calendar sync job enqueue failed:', queueError)
    }
  }

  revalidatePath('/dashboard/calendar')
}

export async function updateCalendarEvent(
  formData: FormData,
): Promise<void> {
  await requirePermission('calendar.update')
  const {
    supabase,
    userId,
    organizationId,
    role,
    membership,
  } = await context()
  const id = text(formData, 'id')

  if (!id) {
    throw new Error('Missing event ID.')
  }

  const { data: existing, error: existingError } = await supabase
    .from('calendar_events')
    .select(
      'created_by,owner_id,external_meeting_id,meeting_provider,calendar_sync_provider,calendar_sync_revision',
    )
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (existingError || !existing) {
    throw new Error('Calendar event was not found.')
  }

  const canEdit =
    EDIT_ALL_ROLES.has(role) ||
    existing.created_by === userId ||
    existing.owner_id === userId ||
    (role === 'manager' && EDIT_TEAM_ROLES.has(role))

  if (!canEdit) {
    throw new Error('You do not have permission to edit this event.')
  }

  const { start, end } = parseTimes(formData)
  const title = text(formData, 'title')
  const description = text(formData, 'description')
  const timezone = text(formData, 'timezone') || 'Asia/Manila'
  const attendeeEmails = text(formData, 'attendee_emails')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const owner = await resolveOwnerAssignmentByUserId(
    membership,
    optionalId(formData, 'owner_id'),
  )

  if (
    existing.meeting_provider === 'zoom' &&
    existing.external_meeting_id
  ) {
    await updateZoomMeeting(
      organizationId,
      existing.external_meeting_id,
      {
        topic: title,
        agenda: description,
        startTime: start,
        durationMinutes: Math.max(
          1,
          Math.round((end.getTime() - start.getTime()) / 60_000),
        ),
        timezone,
      },
    )
  } else if (
    existing.meeting_provider === 'teams' &&
    existing.external_meeting_id
  ) {
    await updateTeamsMeeting(
      organizationId,
      existing.external_meeting_id,
      {
        subject: title,
        startTime: start,
        endTime: end,
        attendeeEmails,
      },
    )
  }

  const revision =
    Number(existing.calendar_sync_revision ?? 0) + 1
  const shouldSync =
    existing.calendar_sync_provider !== 'none'

  const { error } = await supabase
    .from('calendar_events')
    .update({
      title,
      description: description || null,
      event_type: text(formData, 'event_type') || 'meeting',
      status: text(formData, 'status') || 'scheduled',
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      timezone,
      all_day: bool(formData, 'all_day'),
      location: text(formData, 'location') || null,
      contact_id: optionalId(formData, 'contact_id'),
      company_id: optionalId(formData, 'company_id'),
      opportunity_id: optionalId(formData, 'opportunity_id'),
      owner_id: owner.ownerUserId,
      owner_membership_id: owner.ownerMembershipId,
      attendee_emails: attendeeEmails,
      calendar_sync_revision: revision,
      calendar_sync_status: shouldSync ? 'pending' : 'disabled',
      calendar_sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }

  if (shouldSync) {
    try {
      const job = await queueCalendarSync({
        organizationId,
        eventId: id,
        revision,
        action: 'upsert',
      })

      await supabase
        .from('calendar_events')
        .update({ calendar_sync_job_id: job.id })
        .eq('organization_id', organizationId)
        .eq('id', id)
    } catch (queueError) {
      console.error('Calendar sync job enqueue failed:', queueError)
    }
  }

  revalidatePath('/dashboard/calendar')
}

export async function deleteCalendarEvent(
  formData: FormData,
): Promise<void> {
  await requirePermission('calendar.delete')
  const {
    supabase,
    userId,
    organizationId,
    role,
  } = await context()
  const id = text(formData, 'id')

  if (!id) {
    throw new Error('Missing event ID.')
  }

  const { data: existing, error } = await supabase
    .from('calendar_events')
    .select(
      'created_by,owner_id,external_meeting_id,meeting_provider,calendar_sync_provider,calendar_sync_revision',
    )
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !existing) {
    throw new Error('Calendar event was not found.')
  }

  const canDelete =
    EDIT_ALL_ROLES.has(role) ||
    existing.created_by === userId ||
    existing.owner_id === userId

  if (!canDelete) {
    throw new Error('You do not have permission to delete this event.')
  }

  if (
    existing.meeting_provider === 'zoom' &&
    existing.external_meeting_id
  ) {
    await deleteZoomMeeting(
      organizationId,
      existing.external_meeting_id,
    )
  } else if (
    existing.meeting_provider === 'teams' &&
    existing.external_meeting_id
  ) {
    await deleteTeamsMeeting(
      organizationId,
      existing.external_meeting_id,
    )
  }

  const shouldSync =
    existing.calendar_sync_provider !== 'none'
  const revision =
    Number(existing.calendar_sync_revision ?? 0) + 1

  if (!shouldSync) {
    const { error: deleteError } = await supabase
      .from('calendar_events')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', id)

    if (deleteError) {
      throw new Error(deleteError.message)
    }

    revalidatePath('/dashboard/calendar')
    return
  }

  const { error: softDeleteError } = await supabase
    .from('calendar_events')
    .update({
      status: 'cancelled',
      deleted_at: new Date().toISOString(),
      calendar_sync_revision: revision,
      calendar_sync_status: 'pending',
      calendar_sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)
    .eq('id', id)

  if (softDeleteError) {
    throw new Error(softDeleteError.message)
  }

  try {
    const job = await queueCalendarSync({
      organizationId,
      eventId: id,
      revision,
      action: 'delete',
    })

    await supabase
      .from('calendar_events')
      .update({ calendar_sync_job_id: job.id })
      .eq('organization_id', organizationId)
      .eq('id', id)
  } catch (queueError) {
    console.error('Calendar deletion job enqueue failed:', queueError)
  }

  revalidatePath('/dashboard/calendar')
}

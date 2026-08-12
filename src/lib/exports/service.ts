import { requireOwner } from '@/lib/auth'
import { enqueueJob } from '@/lib/jobs/queue'
import type { JsonValue } from '@/lib/jobs/types'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganizationTimezone } from '@/lib/team'

import {
  EXPORT_FORMATS,
  EXPORT_RESOURCES,
  type CreateExportInput,
  type CreateExportScheduleInput,
  type ExportJobRecord,
  type ExportScheduleRecord,
  type UpdateExportScheduleInput,
} from './types'

type ProfileIdentity = {
  full_name: string | null
  email: string | null
}

function mapJob(row: Record<string, unknown>): ExportJobRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    resource: row.resource as ExportJobRecord['resource'],
    format: row.format as ExportJobRecord['format'],
    status: row.status as ExportJobRecord['status'],
    fileName: row.file_name ? String(row.file_name) : null,
    rowCount: Number(row.row_count ?? 0),
    fileSizeBytes: Number(row.file_size_bytes ?? 0),
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdBy: String(row.created_by),
    createdByName: null,
    createdByEmail: null,
  }
}

function mapSchedule(row: Record<string, unknown>): ExportScheduleRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    resource: row.resource as ExportScheduleRecord['resource'],
    format: row.format as ExportScheduleRecord['format'],
    frequency: row.frequency as ExportScheduleRecord['frequency'],
    timezone: String(row.timezone),
    nextRunAt: String(row.next_run_at),
    isActive: Boolean(row.is_active),
    filters:
      row.filters && typeof row.filters === 'object'
        ? (row.filters as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    createdBy: String(row.created_by),
    createdByName: null,
    createdByEmail: null,
  }
}

function validate(input: CreateExportInput) {
  if (!EXPORT_RESOURCES.includes(input.resource)) {
    throw new Error('Unsupported export resource.')
  }

  if (!EXPORT_FORMATS.includes(input.format)) {
    throw new Error('Unsupported export format.')
  }
}

async function loadProfileIdentities(
  organizationId: string,
  userIds: string[],
): Promise<Map<string, ProfileIdentity>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map()

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id,full_name,email')
    .eq('organization_id', organizationId)
    .in('id', ids)

  return new Map(
    (data ?? []).map((profile) => [
      String(profile.id),
      {
        full_name:
          typeof profile.full_name === 'string' ? profile.full_name : null,
        email: typeof profile.email === 'string' ? profile.email : null,
      },
    ]),
  )
}

export async function listExports() {
  const membership = await requireOwner()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('export_jobs')
    .select('*')
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)

  const rows = (data ?? []).map((row) =>
    mapJob(row as Record<string, unknown>),
  )
  const identities = await loadProfileIdentities(
    membership.organization_id,
    rows.map((row) => row.createdBy),
  )

  return rows.map((row) => {
    const identity = identities.get(row.createdBy)
    return {
      ...row,
      createdByName: identity?.full_name ?? null,
      createdByEmail: identity?.email ?? null,
    }
  })
}

export async function createExport(input: CreateExportInput) {
  validate(input)

  const membership = await requireOwner()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('export_jobs')
    .insert({
      organization_id: membership.organization_id,
      owner_user_id: membership.user_id,
      resource: input.resource,
      format: input.format,
      filters: input.filters ?? {},
      status: 'queued',
      created_by: membership.user_id,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  const record = mapJob(data as Record<string, unknown>)
  const job = await enqueueJob({
    organizationId: membership.organization_id,
    queue: 'reports',
    jobType: 'exports.generate',
    payload: {
      exportId: record.id,
      organizationId: membership.organization_id,
      resource: input.resource,
      format: input.format,
      filters: (input.filters ?? {}) as unknown as JsonValue,
    },
    idempotencyKey: `export:${record.id}`,
    maxAttempts: 5,
  })

  await supabase
    .from('export_jobs')
    .update({ background_job_id: job.id })
    .eq('id', record.id)
    .eq('organization_id', membership.organization_id)

  return record
}

export async function getExportDownload(id: string) {
  const membership = await requireOwner()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('export_jobs')
    .select('*')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (error) throw new Error('Export not found.')
  if (data.status !== 'completed' || !data.storage_path) {
    throw new Error('Export is not ready.')
  }

  const signed = await supabase.storage
    .from(data.storage_bucket || 'exports')
    .createSignedUrl(data.storage_path, 300, {
      download: data.file_name || true,
    })

  if (signed.error) throw new Error(signed.error.message)
  return signed.data.signedUrl
}

export async function deleteExport(id: string) {
  const membership = await requireOwner()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('export_jobs')
    .select('id,status,storage_bucket,storage_path')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (error || !data) throw new Error('Export not found.')
  if (data.status === 'queued' || data.status === 'processing') {
    throw new Error('A queued or processing export cannot be deleted.')
  }

  if (data.storage_path) {
    const removal = await supabase.storage
      .from(data.storage_bucket || 'exports')
      .remove([data.storage_path])

    if (removal.error) throw new Error(removal.error.message)
  }

  const deletion = await supabase
    .from('export_jobs')
    .delete()
    .eq('id', id)
    .eq('organization_id', membership.organization_id)

  if (deletion.error) throw new Error(deletion.error.message)
}

export async function listExportSchedules() {
  const membership = await requireOwner()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('export_schedules')
    .select('*')
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const rows = (data ?? []).map((row) =>
    mapSchedule(row as Record<string, unknown>),
  )
  const identities = await loadProfileIdentities(
    membership.organization_id,
    rows.map((row) => row.createdBy),
  )

  return rows.map((row) => {
    const identity = identities.get(row.createdBy)
    return {
      ...row,
      createdByName: identity?.full_name ?? null,
      createdByEmail: identity?.email ?? null,
    }
  })
}

export async function createExportSchedule(
  input: CreateExportScheduleInput,
) {
  validate(input)

  const membership = await requireOwner()
  const supabase = await createClient()
  const organizationTimeZone = await getCurrentOrganizationTimezone()
  const name = input.name.trim()

  if (!name) throw new Error('Schedule name is required.')
  if (!['daily', 'weekly', 'monthly'].includes(input.frequency)) {
    throw new Error('Unsupported export schedule frequency.')
  }

  const nextRun = new Date(input.nextRunAt)
  if (Number.isNaN(nextRun.getTime())) {
    throw new Error('A valid first run date and time is required.')
  }

  const { data, error } = await supabase
    .from('export_schedules')
    .insert({
      organization_id: membership.organization_id,
      owner_user_id: membership.user_id,
      name,
      resource: input.resource,
      format: input.format,
      frequency: input.frequency,
      timezone: input.timezone ?? organizationTimeZone,
      next_run_at: nextRun.toISOString(),
      is_active: input.isActive ?? true,
      filters: input.filters ?? {},
      created_by: membership.user_id,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapSchedule(data as Record<string, unknown>)
}

export async function updateExportSchedule(
  id: string,
  input: UpdateExportScheduleInput,
) {
  const membership = await requireOwner()
  const supabase = await createClient()

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (typeof input.isActive === 'boolean') {
    updates.is_active = input.isActive
  }

  if (typeof input.name === 'string') {
    const name = input.name.trim()
    if (!name) throw new Error('Schedule name cannot be empty.')
    updates.name = name
  }

  const { data, error } = await supabase
    .from('export_schedules')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapSchedule(data as Record<string, unknown>)
}

export async function deleteExportSchedule(id: string) {
  const membership = await requireOwner()
  const supabase = await createClient()

  const { error } = await supabase
    .from('export_schedules')
    .delete()
    .eq('id', id)
    .eq('organization_id', membership.organization_id)

  if (error) throw new Error(error.message)
}

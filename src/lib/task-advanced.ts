import { createClient } from '@/lib/supabase/server'

export type TaskType =
  | 'follow_up'
  | 'call'
  | 'email'
  | 'meeting'
  | 'research'
  | 'internal'
  | 'other'

export type TaskSource =
  | 'manual'
  | 'ai'
  | 'sequence'
  | 'campaign'
  | 'automation'
  | 'import'
  | 'system'

export type TaskStatus = 'pending' | 'completed' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high'

export type AdvancedTask = {
  id: string
  organization_id: string
  contact_id: string
  title: string
  description: string | null
  due_at: string | null
  start_at: string | null
  reminder_at: string | null
  status: TaskStatus
  priority: TaskPriority
  task_type: TaskType
  source: TaskSource
  assigned_to: string | null
  owner_membership_id: string | null
  created_by: string
  completed_at: string | null
  completed_by: string | null
  cancelled_at: string | null
  estimated_minutes: number | null
  actual_minutes: number | null
  recurrence_rule: string | null
  recurrence_parent_id: string | null
  outcome: string | null
  blocked_reason: string | null
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type TaskFieldDefinition = {
  id: string
  field_key: string
  label: string
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select'
  options: unknown[]
  is_required: boolean
  is_active: boolean
  position: number
}

export function isTaskType(value: string): value is TaskType {
  return ['follow_up', 'call', 'email', 'meeting', 'research', 'internal', 'other'].includes(value)
}

export function isTaskPriority(value: string): value is TaskPriority {
  return value === 'low' || value === 'medium' || value === 'high'
}

export function isTaskStatus(value: string): value is TaskStatus {
  return value === 'pending' || value === 'completed' || value === 'cancelled'
}

export async function getTaskFieldDefinitions(organizationId: string): Promise<TaskFieldDefinition[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('task_field_definitions')
    .select('id,field_key,label,field_type,options,is_required,is_active,position')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as TaskFieldDefinition[]
}

export async function listTaskFieldDefinitions(): Promise<TaskFieldDefinition[]> {
  const { getCurrentOrganization } = await import('@/lib/team')
  const organization = await getCurrentOrganization()
  if (!organization) return []
  return getTaskFieldDefinitions(organization.organization_id)
}

export async function upsertTaskFieldDefinition(input: {
  id?: string
  fieldKey: string
  label: string
  fieldType: TaskFieldDefinition['field_type']
  options: unknown[]
  isRequired: boolean
  isActive: boolean
  position: number
}): Promise<TaskFieldDefinition> {
  const { getCurrentOrganization } = await import('@/lib/team')
  const organization = await getCurrentOrganization()
  if (!organization) throw new Error('An active organization is required.')
  const key = input.fieldKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  const label = input.label.trim()
  if (!key || !/^[a-z][a-z0-9_]{0,62}$/.test(key)) throw new Error('A valid field key is required.')
  if (!label || label.length > 120) throw new Error('A field label is required and must not exceed 120 characters.')
  const supabase = await createClient()
  const values = {
    organization_id: organization.organization_id,
    field_key: key,
    label,
    field_type: input.fieldType,
    options: input.options,
    is_required: input.isRequired,
    is_active: input.isActive,
    position: Math.max(0, Math.trunc(input.position)),
    created_by: organization.user_id,
    updated_at: new Date().toISOString(),
  }
  const query = input.id
    ? supabase.from('task_field_definitions').update(values).eq('id', input.id).eq('organization_id', organization.organization_id)
    : supabase.from('task_field_definitions').insert(values)
  const { data, error } = await query.select('id,field_key,label,field_type,options,is_required,is_active,position').single()
  if (error) throw new Error(error.message)
  return data as TaskFieldDefinition
}

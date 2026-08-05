'use server'

import { revalidatePath } from 'next/cache'

import { requirePermission } from '@/lib/auth'
import { resolveOwnerAssignment } from '@/lib/ownership'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { isTaskPriority, isTaskStatus, isTaskType } from '@/lib/task-advanced'

const text = (formData: FormData, key: string) => formData.get(key)?.toString().trim() ?? ''

function nullableDate(value: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('A valid date and time is required.')
  return parsed.toISOString()
}

function nullableInteger(value: string): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error('A valid duration is required.')
  return parsed
}

async function authenticatedClient() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Authentication required.')
  return { supabase, user }
}

async function loadTask(taskId: string) {
  const { supabase, user } = await authenticatedClient()
  const { data, error } = await supabase
    .from('contact_tasks')
    .select('id,organization_id,contact_id,status,assigned_to,owner_membership_id')
    .eq('id', taskId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('The task was not found or is not accessible.')
  return { supabase, user, task: data }
}

function revalidateTaskPaths(contactId?: string | null) {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/tasks')
  if (contactId) revalidatePath(`/dashboard/contacts/${contactId}`)
}

export async function createAdvancedTask(formData: FormData) {
  const organization = await requirePermission('tasks.create')
  const title = text(formData, 'title')
  const contactId = text(formData, 'contactId')
  const taskTypeValue = text(formData, 'taskType') || 'follow_up'
  const priorityValue = text(formData, 'priority') || 'medium'
  const startAt = nullableDate(text(formData, 'startAt'))
  const dueAt = nullableDate(text(formData, 'dueAt'))
  const reminderAt = nullableDate(text(formData, 'reminderAt'))
  const estimatedMinutes = nullableInteger(text(formData, 'estimatedMinutes'))

  if (!title || title.length > 200) throw new Error('Task title must contain between 1 and 200 characters.')
  if (!contactId) throw new Error('A contact is required for this task.')
  if (!isTaskType(taskTypeValue)) throw new Error('A valid task type is required.')
  if (!isTaskPriority(priorityValue)) throw new Error('A valid priority is required.')
  if (startAt && dueAt && new Date(startAt) > new Date(dueAt)) throw new Error('The start date cannot be after the due date.')

  const { supabase, user } = await authenticatedClient()
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id,organization_id')
    .eq('id', contactId)
    .eq('organization_id', organization.organization_id)
    .maybeSingle()
  if (contactError) throw new Error(contactError.message)
  if (!contact) throw new Error('The selected contact is not available in this organization.')

  const membership = await getCurrentOrganization()
  if (!membership) throw new Error('Unable to resolve the active organization.')
  const owner = await resolveOwnerAssignment(membership, text(formData, 'owner_membership_id'))

  const { error } = await supabase.from('contact_tasks').insert({
    organization_id: organization.organization_id,
    contact_id: contact.id,
    title,
    description: text(formData, 'description') || null,
    task_type: taskTypeValue,
    source: 'manual',
    start_at: startAt,
    due_at: dueAt,
    reminder_at: reminderAt,
    estimated_minutes: estimatedMinutes,
    recurrence_rule: text(formData, 'recurrenceRule') || null,
    priority: priorityValue,
    status: 'pending',
    assigned_to: owner.ownerUserId,
    owner_membership_id: owner.ownerMembershipId,
    created_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidateTaskPaths(contactId)
}

export async function updateAdvancedTask(formData: FormData) {
  await requirePermission('tasks.update')
  const taskId = text(formData, 'taskId')
  const title = text(formData, 'title')
  const taskTypeValue = text(formData, 'taskType') || 'follow_up'
  const priorityValue = text(formData, 'priority') || 'medium'
  const statusValue = text(formData, 'status') || 'pending'
  if (!taskId) throw new Error('A valid task is required.')
  if (!title || title.length > 200) throw new Error('Task title must contain between 1 and 200 characters.')
  if (!isTaskType(taskTypeValue) || !isTaskPriority(priorityValue) || !isTaskStatus(statusValue)) throw new Error('The task contains an invalid type, priority, or status.')

  const { supabase, task } = await loadTask(taskId)
  const startAt = nullableDate(text(formData, 'startAt'))
  const dueAt = nullableDate(text(formData, 'dueAt'))
  if (startAt && dueAt && new Date(startAt) > new Date(dueAt)) throw new Error('The start date cannot be after the due date.')

  const { error } = await supabase
    .from('contact_tasks')
    .update({
      title,
      description: text(formData, 'description') || null,
      task_type: taskTypeValue,
      start_at: startAt,
      due_at: dueAt,
      reminder_at: nullableDate(text(formData, 'reminderAt')),
      estimated_minutes: nullableInteger(text(formData, 'estimatedMinutes')),
      actual_minutes: nullableInteger(text(formData, 'actualMinutes')),
      recurrence_rule: text(formData, 'recurrenceRule') || null,
      outcome: text(formData, 'outcome') || null,
      blocked_reason: text(formData, 'blockedReason') || null,
      priority: priorityValue,
      status: statusValue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidateTaskPaths(task.contact_id)
}

export async function changeTaskStatus(formData: FormData) {
  await requirePermission('tasks.update')
  const taskId = text(formData, 'taskId')
  const status = text(formData, 'status')
  if (!taskId || !isTaskStatus(status)) throw new Error('A valid task and status are required.')
  const { supabase, task } = await loadTask(taskId)
  const { error } = await supabase.from('contact_tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidateTaskPaths(task.contact_id)
}

export async function deleteAdvancedTask(formData: FormData) {
  await requirePermission('tasks.delete')
  const taskId = text(formData, 'taskId')
  if (!taskId) throw new Error('A valid task is required.')
  const { supabase, task } = await loadTask(taskId)
  const { error } = await supabase.from('contact_tasks').delete().eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidateTaskPaths(task.contact_id)
}

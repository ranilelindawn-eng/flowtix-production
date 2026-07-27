'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth'
import {
  createContact as createContactRecord,
  deleteContact as deleteContactRecord,
  updateContact as updateContactRecord,
} from '@/lib/contacts'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { assertContactCapacity } from '@/lib/usage-limits'

const getString = (formData: FormData, key: string) =>
  formData.get(key)?.toString().trim() ?? ''

type ContactValues = {
  first_name: string
  last_name: string
  company: string
  email: string
  phone: string
  job_title: string
  status: 'active' | 'inactive' | 'archived'
  mobile: string
  tags: string
  notes: string
  owner_id: string
}

type ContactTaskStatus = 'pending' | 'completed' | 'cancelled'
type ContactTaskPriority = 'low' | 'medium' | 'high'

function revalidateContactPaths(contactId: string) {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/contacts')
  revalidatePath(`/dashboard/contacts/${contactId}`)
}

function parseTaskStatus(value: string): ContactTaskStatus {
  if (
    value === 'pending' ||
    value === 'completed' ||
    value === 'cancelled'
  ) {
    return value
  }

  throw new Error('A valid task status is required.')
}

function parseTaskPriority(value: string): ContactTaskPriority {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value
  }

  return 'medium'
}

async function getAuthenticatedSupabaseClient() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('Authentication required.')
  }

  return {
    supabase,
    user,
  }
}

async function getAccessibleContactTask(taskId: string) {
  const { supabase } = await getAuthenticatedSupabaseClient()

  const { data: task, error: taskError } = await supabase
    .from('contact_tasks')
    .select('id, contact_id, organization_id, status')
    .eq('id', taskId)
    .maybeSingle()

  if (taskError) {
    throw new Error(taskError.message)
  }

  if (!task) {
    throw new Error(
      'The selected task was not found or is not accessible.',
    )
  }

  return {
    supabase,
    task,
  }
}

export async function createContact(formData: FormData) {
  const organization = await requirePermission(
    'contacts.create',
  )

  await assertContactCapacity(
    organization.organization_id,
  )

  const values: ContactValues = {
    first_name: getString(formData, 'first_name'),
    last_name: getString(formData, 'last_name'),
    company: getString(formData, 'company'),
    email: getString(formData, 'email'),
    phone: getString(formData, 'phone'),
    job_title: getString(formData, 'job_title'),
    status: getString(
      formData,
      'status',
    ) as ContactValues['status'],
    mobile: getString(formData, 'mobile'),
    tags: getString(formData, 'tags'),
    notes: getString(formData, 'notes'),
    owner_id: getString(formData, 'owner_id'),
  }

  await createContactRecord(values)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/contacts')

  redirect('/dashboard/contacts')
}

export async function updateContact(formData: FormData) {
  await requirePermission('contacts.update')

  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid contact ID is required.')
  }

  const values: ContactValues = {
    first_name: getString(formData, 'first_name'),
    last_name: getString(formData, 'last_name'),
    company: getString(formData, 'company'),
    email: getString(formData, 'email'),
    phone: getString(formData, 'phone'),
    job_title: getString(formData, 'job_title'),
    status: getString(
      formData,
      'status',
    ) as ContactValues['status'],
    mobile: getString(formData, 'mobile'),
    tags: getString(formData, 'tags'),
    notes: getString(formData, 'notes'),
    owner_id: getString(formData, 'owner_id'),
  }

  await updateContactRecord(id, values)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/contacts')
  revalidatePath(`/dashboard/contacts/${id}`)
  revalidatePath(`/dashboard/contacts/${id}/edit`)

  redirect(`/dashboard/contacts/${id}`)
}

export async function deleteContact(formData: FormData) {
  await requirePermission('contacts.delete')

  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid contact ID is required.')
  }

  await deleteContactRecord(id)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/contacts')

  redirect('/dashboard/contacts')
}

export async function createContactNote(formData: FormData) {
  await requirePermission('contacts.update')

  const contactId = getString(formData, 'contactId')
  const body = getString(formData, 'body')

  if (!contactId) {
    throw new Error('A valid contact ID is required.')
  }

  if (!body) {
    throw new Error('Note cannot be empty.')
  }

  if (body.length > 5000) {
    throw new Error('Note cannot exceed 5,000 characters.')
  }

  const {
    supabase,
    user,
  } = await getAuthenticatedSupabaseClient()

  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, organization_id')
    .eq('id', contactId)
    .maybeSingle()

  if (contactError) {
    throw new Error(contactError.message)
  }

  if (!contact) {
    throw new Error(
      'The selected contact was not found or is not accessible.',
    )
  }

  if (!contact.organization_id) {
    throw new Error('The contact does not have an organization.')
  }

  const { error: insertError } = await supabase
    .from('contact_notes')
    .insert({
      organization_id: contact.organization_id,
      contact_id: contact.id,
      body,
      created_by: user.id,
    })

  if (insertError) {
    throw new Error(insertError.message)
  }

  revalidateContactPaths(contactId)
}

export async function createContactTask(formData: FormData) {
  await requirePermission('contacts.update')

  const contactId = getString(formData, 'contactId')
  const title = getString(formData, 'title')
  const description = getString(formData, 'description')
  const dueAt = getString(formData, 'dueAt')
  const priority = parseTaskPriority(
    getString(formData, 'priority'),
  )

  if (!contactId) {
    throw new Error('A valid contact ID is required.')
  }

  if (!title) {
    throw new Error('Task title is required.')
  }

  if (title.length > 200) {
    throw new Error('Task title cannot exceed 200 characters.')
  }

  if (description.length > 5000) {
    throw new Error(
      'Task description cannot exceed 5,000 characters.',
    )
  }

  const {
    supabase,
    user,
  } = await getAuthenticatedSupabaseClient()

  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, organization_id')
    .eq('id', contactId)
    .maybeSingle()

  if (contactError) {
    throw new Error(contactError.message)
  }

  if (!contact) {
    throw new Error(
      'The selected contact was not found or is not accessible.',
    )
  }

  if (!contact.organization_id) {
    throw new Error('The contact does not have an organization.')
  }

  const { error: insertError } = await supabase
    .from('contact_tasks')
    .insert({
      organization_id: contact.organization_id,
      contact_id: contact.id,
      title,
      description: description || null,
      due_at: dueAt || null,
      status: 'pending',
      priority,
      created_by: user.id,
      completed_at: null,
    })

  if (insertError) {
    throw new Error(insertError.message)
  }

  revalidateContactPaths(contactId)
}

export async function completeContactTask(formData: FormData) {
  await requirePermission('contacts.update')

  const taskId = getString(formData, 'taskId')
  const contactId = getString(formData, 'contactId')
  const nextStatus = parseTaskStatus(
    getString(formData, 'status'),
  )

  if (!taskId) {
    throw new Error('A valid task ID is required.')
  }

  if (!contactId) {
    throw new Error('A valid contact ID is required.')
  }

  if (nextStatus !== 'pending' && nextStatus !== 'completed') {
    throw new Error(
      'Tasks can only be marked pending or completed here.',
    )
  }

  const { supabase, task } = await getAccessibleContactTask(taskId)

  if (task.contact_id !== contactId) {
    throw new Error(
      'The selected task does not belong to this contact.',
    )
  }

  const { error: updateError } = await supabase
    .from('contact_tasks')
    .update({
      status: nextStatus,
      completed_at:
        nextStatus === 'completed'
          ? new Date().toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('contact_id', contactId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  revalidateContactPaths(contactId)
}

export async function updateContactTask(formData: FormData) {
  await requirePermission('contacts.update')

  const taskId = getString(formData, 'taskId')
  const contactId = getString(formData, 'contactId')
  const title = getString(formData, 'title')
  const description = getString(formData, 'description')
  const dueAt = getString(formData, 'dueAt')
  const priority = parseTaskPriority(
    getString(formData, 'priority'),
  )
  const status = parseTaskStatus(getString(formData, 'status'))

  if (!taskId) {
    throw new Error('A valid task ID is required.')
  }

  if (!contactId) {
    throw new Error('A valid contact ID is required.')
  }

  if (!title) {
    throw new Error('Task title is required.')
  }

  if (title.length > 200) {
    throw new Error('Task title cannot exceed 200 characters.')
  }

  if (description.length > 5000) {
    throw new Error(
      'Task description cannot exceed 5,000 characters.',
    )
  }

  const { supabase, task } = await getAccessibleContactTask(taskId)

  if (task.contact_id !== contactId) {
    throw new Error(
      'The selected task does not belong to this contact.',
    )
  }

  const completedAt =
    status === 'completed'
      ? task.status === 'completed'
        ? undefined
        : new Date().toISOString()
      : null

  const updateValues: {
    title: string
    description: string | null
    due_at: string | null
    priority: ContactTaskPriority
    status: ContactTaskStatus
    completed_at?: string | null
    updated_at: string
  } = {
    title,
    description: description || null,
    due_at: dueAt || null,
    priority,
    status,
    updated_at: new Date().toISOString(),
  }

  if (completedAt !== undefined) {
    updateValues.completed_at = completedAt
  }

  const { error: updateError } = await supabase
    .from('contact_tasks')
    .update(updateValues)
    .eq('id', taskId)
    .eq('contact_id', contactId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  revalidateContactPaths(contactId)
}

export async function deleteContactTask(formData: FormData) {
  await requirePermission('contacts.update')

  const taskId = getString(formData, 'taskId')
  const contactId = getString(formData, 'contactId')

  if (!taskId) {
    throw new Error('A valid task ID is required.')
  }

  if (!contactId) {
    throw new Error('A valid contact ID is required.')
  }

  const { supabase, task } = await getAccessibleContactTask(taskId)

  if (task.contact_id !== contactId) {
    throw new Error(
      'The selected task does not belong to this contact.',
    )
  }

  const { error: deleteError } = await supabase
    .from('contact_tasks')
    .delete()
    .eq('id', taskId)
    .eq('contact_id', contactId)

  if (deleteError) {
    throw new Error(deleteError.message)
  }

  revalidateContactPaths(contactId)
}

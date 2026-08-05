'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const value = (formData: FormData, key: string) => formData.get(key)?.toString().trim() ?? ''
const categories = new Set(['general','lifecycle','source','priority','campaign','product','region','custom'])

function validateColor(color: string) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error('A valid six-digit tag color is required.')
  return color
}

export async function createTagAction(formData: FormData) {
  const organization = await requirePermission('contacts.update')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required.')
  const name = value(formData, 'name')
  const category = value(formData, 'category') || 'general'
  if (!name) throw new Error('Tag name is required.')
  if (!categories.has(category)) throw new Error('Invalid tag category.')
  const { error } = await supabase.from('tags').insert({
    organization_id: organization.organization_id,
    name,
    slug: value(formData, 'slug') || name,
    color: validateColor(value(formData, 'color') || '#2563eb'),
    description: value(formData, 'description') || null,
    category,
    created_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/tags')
}

export async function updateTagAction(formData: FormData) {
  const organization = await requirePermission('contacts.update')
  const supabase = await createClient()
  const id = value(formData, 'id')
  const name = value(formData, 'name')
  const category = value(formData, 'category') || 'general'
  if (!id || !name) throw new Error('Tag ID and name are required.')
  if (!categories.has(category)) throw new Error('Invalid tag category.')
  const { error } = await supabase.from('tags').update({
    name,
    slug: value(formData, 'slug') || name,
    color: validateColor(value(formData, 'color') || '#2563eb'),
    description: value(formData, 'description') || null,
    category,
  }).eq('id', id).eq('organization_id', organization.organization_id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/tags')
}

export async function toggleTagAction(formData: FormData) {
  const organization = await requirePermission('contacts.update')
  const supabase = await createClient()
  const id = value(formData, 'id')
  const isActive = value(formData, 'is_active') === 'true'
  if (!id) throw new Error('Tag ID is required.')
  const { error } = await supabase.from('tags').update({ is_active: isActive }).eq('id', id).eq('organization_id', organization.organization_id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/tags')
}

export async function deleteTagAction(formData: FormData) {
  const organization = await requirePermission('contacts.update')
  const supabase = await createClient()
  const id = value(formData, 'id')
  if (!id) throw new Error('Tag ID is required.')
  const { count, error: countError } = await supabase.from('entity_tags').select('id', { count: 'exact', head: true }).eq('organization_id', organization.organization_id).eq('tag_id', id)
  if (countError) throw new Error(countError.message)
  if ((count ?? 0) > 0) throw new Error('Archive tags that are currently assigned instead of deleting them.')
  const { error } = await supabase.from('tags').delete().eq('id', id).eq('organization_id', organization.organization_id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/tags')
}

'use server'

import { revalidatePath } from 'next/cache'

import { requireOwner } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim()
}

function createSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function saveOrganizationSettings(formData: FormData) {
  const organization = await requireOwner()
  const submittedOrganizationId = getString(formData, 'organization_id')
  const organizationName = getString(formData, 'organization_name')
  const requestedSlug = getString(formData, 'organization_slug')
  const logoUrl = getString(formData, 'logo_url')

  if (
    submittedOrganizationId &&
    submittedOrganizationId !== organization.organization_id
  ) {
    throw new Error(
      'The submitted organization does not match the active workspace.',
    )
  }

  if (organizationName.length < 2 || organizationName.length > 120) {
    throw new Error(
      'Company name must contain between 2 and 120 characters.',
    )
  }

  const organizationSlug = createSlug(requestedSlug || organizationName)

  if (organizationSlug.length < 2 || organizationSlug.length > 80) {
    throw new Error(
      'Workspace slug must contain between 2 and 80 valid characters.',
    )
  }

  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    throw new Error('Unable to connect to Supabase.')
  }

  const { data, error } = await supabase
    .from('organizations')
    .update({
      name: organizationName,
      slug: organizationSlug,
      logo_url: logoUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organization.organization_id)
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      throw new Error('That workspace slug is already in use.')
    }

    throw new Error(`Failed to update organization: ${error.message}`)
  }

  if (!data) {
    throw new Error(
      'Organization update was rejected. Only the owner can make this change.',
    )
  }

  revalidatePath('/dashboard', 'layout')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/organization')
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/settings/organization')
}

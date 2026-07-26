'use server'

import { revalidatePath } from 'next/cache'

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
  const organizationId = getString(formData, 'organization_id')
  const organizationName = getString(formData, 'organization_name')
  const requestedSlug = getString(formData, 'organization_slug')
  const logoUrl = getString(formData, 'logo_url')

  if (!organizationId) {
    throw new Error('Organization ID is required.')
  }

  if (!organizationName) {
    throw new Error('Organization name is required.')
  }

  const organizationSlug = createSlug(
    requestedSlug || organizationName,
  )

  if (!organizationSlug) {
    throw new Error('Enter a valid organization slug.')
  }

  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    throw new Error('Unable to connect to Supabase.')
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error(
      'You must be signed in to update your organization.',
    )
  }

  const { error } = await supabase
    .from('organizations')
    .update({
      name: organizationName,
      slug: organizationSlug,
      logo_url: logoUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId)

  if (error) {
    throw new Error(
      `Failed to update organization: ${error.message}`,
    )
  }

  revalidatePath('/dashboard/settings/organization')
  revalidatePath('/dashboard')
}
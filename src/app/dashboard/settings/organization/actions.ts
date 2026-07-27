'use server'

import { revalidatePath } from 'next/cache'

import { requirePermission } from '@/lib/auth'
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
  const organization = await requirePermission(
    'organization.update',
  )
  const submittedOrganizationId = getString(
    formData,
    'organization_id',
  )
  const organizationName = getString(
    formData,
    'organization_name',
  )
  const requestedSlug = getString(
    formData,
    'organization_slug',
  )
  const logoUrl = getString(formData, 'logo_url')

  if (
    submittedOrganizationId &&
    submittedOrganizationId !== organization.organization_id
  ) {
    throw new Error(
      'The submitted organization does not match the active workspace.',
    )
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

  const { error } = await supabase
    .from('organizations')
    .update({
      name: organizationName,
      slug: organizationSlug,
      logo_url: logoUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organization.organization_id)

  if (error) {
    throw new Error(
      `Failed to update organization: ${error.message}`,
    )
  }

  revalidatePath('/dashboard/settings/organization')
  revalidatePath('/dashboard')
}

'use server'

import { revalidatePath } from 'next/cache'

import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'

const clean = (formData: FormData, key: string) =>
  String(formData.get(key) ?? '').trim()

export async function setDefaultPhoneNumber(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) {
    throw new Error('Owner or admin access is required.')
  }

  const id = clean(formData, 'id')
  const { error } = await supabase.rpc('set_workspace_default_phone_number', {
    target_organization: organizationId,
    target_phone_number: id,
  })

  if (error) {
    throw new Error(`Unable to set the default caller ID: ${error.message}`)
  }

  revalidatePath('/dashboard/settings/phone-numbers')
  revalidatePath('/dashboard/dialer')
}

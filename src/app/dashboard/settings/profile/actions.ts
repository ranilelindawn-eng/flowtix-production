'use server'

import { revalidatePath } from 'next/cache'

import { createServerSupabaseClient } from '@/lib/supabase/server'

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim()
}

export async function saveProfileSettings(formData: FormData) {
  const fullName = getString(formData, 'full_name')
  const avatarUrl = getString(formData, 'avatar_url')

  if (!fullName) {
    throw new Error('Full name is required.')
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
    throw new Error('You must be signed in to update your profile.')
  }

  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: fullName,
      avatar_url: avatarUrl || null,
    },
  })

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`)
  }

  revalidatePath('/dashboard/settings/profile')
  revalidatePath('/dashboard')
}
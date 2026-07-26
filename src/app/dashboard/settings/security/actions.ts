'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createServerSupabaseClient } from '@/lib/supabase/server'

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '')
}

export async function updatePassword(formData: FormData) {
  const password = getString(formData, 'password')
  const confirmPassword = getString(formData, 'confirm_password')

  if (!password) {
    throw new Error('A new password is required.')
  }

  if (password.length < 8) {
    throw new Error('Your password must contain at least 8 characters.')
  }

  if (password !== confirmPassword) {
    throw new Error('The passwords do not match.')
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
    throw new Error('You must be signed in to update your password.')
  }

  const { error } = await supabase.auth.updateUser({
    password,
  })

  if (error) {
    throw new Error(`Failed to update password: ${error.message}`)
  }

  revalidatePath('/dashboard/settings/security')
  redirect('/dashboard/settings/security?updated=true')
}
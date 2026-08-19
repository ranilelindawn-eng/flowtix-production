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

  const normalizedAvatarUrl = avatarUrl || null

  const { data: existingProfile, error: profileLoadError } = await supabase
    .from('profiles')
    .select('full_name,avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  if (profileLoadError) {
    throw new Error(`Failed to load profile: ${profileLoadError.message}`)
  }

  const { data: updatedProfile, error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      avatar_url: normalizedAvatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (profileError || !updatedProfile) {
    throw new Error(
      `Failed to update Flowtix profile: ${profileError?.message ?? 'Profile row was not found.'}`,
    )
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      full_name: fullName,
      avatar_url: normalizedAvatarUrl,
    },
  })

  if (metadataError) {
    const { error: rollbackError } = await supabase
      .from('profiles')
      .update({
        full_name: existingProfile?.full_name ?? null,
        avatar_url: existingProfile?.avatar_url ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (rollbackError) {
      console.error('Unable to roll back Flowtix profile after metadata failure:', rollbackError)
    }

    throw new Error(`Failed to update account profile: ${metadataError.message}`)
  }

  revalidatePath('/dashboard/settings/profile')
  revalidatePath('/dashboard')
}
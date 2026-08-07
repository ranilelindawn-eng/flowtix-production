'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type PlatformSupportActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

export async function startPlatformSupportSession(
  _previousState: PlatformSupportActionState,
  formData: FormData,
): Promise<PlatformSupportActionState> {
  await requirePlatformPermission('platform.impersonation.use')

  const organizationId = formString(formData, 'organizationId')
  const reason = formString(formData, 'reason')
  const reference = formString(formData, 'reference')

  if (!organizationId) {
    return {
      status: 'error',
      message: 'Select an organization before starting support access.',
    }
  }

  if (reason.length < 15) {
    return {
      status: 'error',
      message: 'Enter a support reason of at least 15 characters.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_start_support_session',
    {
      p_organization_id: organizationId,
      p_reason: reason,
      p_reference: reference || null,
    },
  )

  if (error) {
    return {
      status: 'error',
      message: `Unable to start support session: ${error.message}`,
    }
  }

  if (typeof data !== 'string' || data.length === 0) {
    return {
      status: 'error',
      message: 'The support session could not be created.',
    }
  }

  redirect(`/platform/support/${data}`)
}

export async function endPlatformSupportSession(
  formData: FormData,
): Promise<void> {
  await requirePlatformPermission('platform.impersonation.use')

  const sessionId = formString(formData, 'sessionId')
  const outcome = formString(formData, 'outcome')

  if (!sessionId) {
    redirect('/platform/support')
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc(
    'platform_end_support_session',
    {
      p_session_id: sessionId,
      p_outcome: outcome || null,
    },
  )

  if (error) {
    throw new Error(`Unable to end support session: ${error.message}`)
  }

  revalidatePath('/platform/support')
  redirect('/platform/support')
}

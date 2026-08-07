'use server'

import { revalidatePath } from 'next/cache'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type OrganizationLifecycleActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}


function getFormString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

export async function updatePlatformOrganizationStatus(
  _previousState: OrganizationLifecycleActionState,
  formData: FormData,
): Promise<OrganizationLifecycleActionState> {
  await requirePlatformPermission('platform.organizations.manage')

  const organizationId = getFormString(formData, 'organizationId')
  const status = getFormString(formData, 'status')
  const reason = getFormString(formData, 'reason')

  if (!organizationId) {
    return { status: 'error', message: 'Organization ID is required.' }
  }

  if (status !== 'active' && status !== 'suspended') {
    return { status: 'error', message: 'Unsupported organization status.' }
  }

  if (reason.length < 10) {
    return {
      status: 'error',
      message: 'Enter a reason of at least 10 characters for this platform action.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_set_organization_status',
    {
      p_organization_id: organizationId,
      p_status: status,
      p_reason: reason,
    },
  )

  if (error) {
    return {
      status: 'error',
      message: `Unable to update organization: ${error.message}`,
    }
  }

  if (!data) {
    return {
      status: 'error',
      message: 'The organization status was not changed.',
    }
  }

  revalidatePath('/platform')
  revalidatePath('/platform/customers')
  revalidatePath(`/platform/customers/${organizationId}`)
  revalidatePath('/platform/organizations')
  revalidatePath(`/platform/organizations/${organizationId}`)
  revalidatePath('/dashboard', 'layout')

  return {
    status: 'success',
    message:
      status === 'suspended'
        ? 'Organization suspended. Customer workspace access is now blocked.'
        : 'Organization reactivated. Eligible customer memberships were restored.',
  }
}

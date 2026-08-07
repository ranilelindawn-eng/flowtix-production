'use server'

import { revalidatePath } from 'next/cache'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type PlatformFeatureFlagActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function parsePercentage(value: string): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null
  }
  return parsed
}

export async function updatePlatformFeatureFlag(
  _previousState: PlatformFeatureFlagActionState,
  formData: FormData,
): Promise<PlatformFeatureFlagActionState> {
  await requirePlatformPermission('platform.flags.manage')

  const flagKey = formString(formData, 'flagKey')
  const reason = formString(formData, 'reason')
  const defaultEnabled =
    formString(formData, 'defaultEnabled') === 'true'
  const rolloutPercentage = parsePercentage(
    formString(formData, 'rolloutPercentage'),
  )

  if (!flagKey) {
    return { status: 'error', message: 'Feature flag key is required.' }
  }

  if (rolloutPercentage === null) {
    return {
      status: 'error',
      message: 'Rollout percentage must be between 0 and 100.',
    }
  }

  if (reason.length < 10) {
    return {
      status: 'error',
      message: 'Enter an action reason of at least 10 characters.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_update_feature_flag',
    {
      p_flag_key: flagKey,
      p_default_enabled: defaultEnabled,
      p_rollout_percentage: rolloutPercentage,
      p_reason: reason,
    },
  )

  if (error) {
    return {
      status: 'error',
      message: `Unable to update feature flag: ${error.message}`,
    }
  }

  if (data !== true) {
    return {
      status: 'error',
      message: 'The feature flag was not updated.',
    }
  }

  revalidatePath('/platform/feature-flags')
  revalidatePath(`/platform/feature-flags/${flagKey}`)

  return {
    status: 'success',
    message: 'Global feature-flag configuration updated.',
  }
}

export async function setOrganizationFeatureFlagOverride(
  _previousState: PlatformFeatureFlagActionState,
  formData: FormData,
): Promise<PlatformFeatureFlagActionState> {
  await requirePlatformPermission('platform.flags.manage')

  const flagKey = formString(formData, 'flagKey')
  const organizationId = formString(formData, 'organizationId')
  const reason = formString(formData, 'reason')
  const enabled = formString(formData, 'enabled') === 'true'
  const rolloutRaw = formString(formData, 'rolloutPercentage')
  const rolloutPercentage =
    rolloutRaw === '' ? null : parsePercentage(rolloutRaw)

  if (!flagKey || !organizationId) {
    return {
      status: 'error',
      message: 'Feature flag and organization are required.',
    }
  }

  if (rolloutRaw !== '' && rolloutPercentage === null) {
    return {
      status: 'error',
      message: 'Override rollout must be between 0 and 100.',
    }
  }

  if (reason.length < 10) {
    return {
      status: 'error',
      message: 'Enter an action reason of at least 10 characters.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_set_feature_flag_override',
    {
      p_flag_key: flagKey,
      p_organization_id: organizationId,
      p_enabled: enabled,
      p_rollout_percentage: rolloutPercentage,
      p_reason: reason,
    },
  )

  if (error) {
    return {
      status: 'error',
      message: `Unable to save organization override: ${error.message}`,
    }
  }

  if (data !== true) {
    return {
      status: 'error',
      message: 'The organization override was not saved.',
    }
  }

  revalidatePath('/platform/feature-flags')
  revalidatePath(`/platform/feature-flags/${flagKey}`)

  return {
    status: 'success',
    message: 'Organization feature-flag override saved.',
  }
}

export async function removeOrganizationFeatureFlagOverride(
  _previousState: PlatformFeatureFlagActionState,
  formData: FormData,
): Promise<PlatformFeatureFlagActionState> {
  await requirePlatformPermission('platform.flags.manage')

  const flagKey = formString(formData, 'flagKey')
  const organizationId = formString(formData, 'organizationId')
  const reason = formString(formData, 'reason')

  if (!flagKey || !organizationId) {
    return {
      status: 'error',
      message: 'Feature flag and organization are required.',
    }
  }

  if (reason.length < 10) {
    return {
      status: 'error',
      message: 'Enter an action reason of at least 10 characters.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_remove_feature_flag_override',
    {
      p_flag_key: flagKey,
      p_organization_id: organizationId,
      p_reason: reason,
    },
  )

  if (error) {
    return {
      status: 'error',
      message: `Unable to remove organization override: ${error.message}`,
    }
  }

  if (data !== true) {
    return {
      status: 'error',
      message: 'The organization override was not removed.',
    }
  }

  revalidatePath('/platform/feature-flags')
  revalidatePath(`/platform/feature-flags/${flagKey}`)

  return {
    status: 'success',
    message: 'Organization override removed. The global flag now applies.',
  }
}

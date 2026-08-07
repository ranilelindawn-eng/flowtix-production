'use server'

import { revalidatePath } from 'next/cache'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type PlatformSettingsActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

export async function updatePlatformSettings(
  _previousState: PlatformSettingsActionState,
  formData: FormData,
): Promise<PlatformSettingsActionState> {
  await requirePlatformPermission('platform.settings.manage')

  const platformName = formString(formData, 'platformName')
  const supportEmail = formString(formData, 'supportEmail')
  const statusPageUrl = formString(formData, 'statusPageUrl')
  const defaultTimezone = formString(formData, 'defaultTimezone')
  const defaultLocale = formString(formData, 'defaultLocale')
  const reason = formString(formData, 'reason')
  const supportReferenceRequired =
    formString(formData, 'supportReferenceRequired') === 'true'
  const sessionMinutes = Number.parseInt(
    formString(formData, 'supportSessionMinutes'),
    10,
  )

  if (platformName.length < 2 || platformName.length > 80) {
    return {
      status: 'error',
      message: 'Platform name must be between 2 and 80 characters.',
    }
  }

  if (!Number.isFinite(sessionMinutes) || sessionMinutes < 5 || sessionMinutes > 120) {
    return {
      status: 'error',
      message: 'Support session duration must be between 5 and 120 minutes.',
    }
  }

  if (!defaultTimezone || defaultTimezone.length > 100) {
    return {
      status: 'error',
      message: 'Enter a valid default timezone.',
    }
  }

  if (!defaultLocale || defaultLocale.length > 20) {
    return {
      status: 'error',
      message: 'Enter a valid default locale.',
    }
  }

  if (reason.length < 10) {
    return {
      status: 'error',
      message: 'Enter an action reason of at least 10 characters.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_update_settings', {
    p_updates: {
      platform_name: platformName,
      support_email: supportEmail,
      status_page_url: statusPageUrl,
      support_session_minutes: sessionMinutes,
      support_reference_required: supportReferenceRequired,
      default_timezone: defaultTimezone,
      default_locale: defaultLocale,
    },
    p_reason: reason,
  })

  if (error) {
    return {
      status: 'error',
      message: `Unable to update Platform Settings: ${error.message}`,
    }
  }

  if (data !== true) {
    return {
      status: 'error',
      message: 'Platform Settings were not updated.',
    }
  }

  revalidatePath('/platform/settings')
  revalidatePath('/platform/support')

  return {
    status: 'success',
    message: 'Platform Settings updated and audit logged.',
  }
}

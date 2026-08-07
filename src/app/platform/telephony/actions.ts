'use server'

import { revalidatePath } from 'next/cache'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { sanitizeProviderMessage } from '@/lib/platform/provider-security'
import { createClient } from '@/lib/supabase/server'
import { verifyProviderConnection } from '@/lib/telephony/provider-admin'
import {
  isTelephonyProvider,
  type ConfiguredTelephonyProviderName,
} from '@/lib/telephony/provider'

type PlatformTelephonyActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

async function recordVerification(input: {
  integrationId: string
  success: boolean
  message: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.rpc(
    'platform_record_telephony_verification',
    {
      p_integration_id: input.integrationId,
      p_success: input.success,
      p_message: input.message,
    },
  )

  if (error) {
    throw new Error(
      `Unable to record telephony verification: ${error.message}`,
    )
  }
}

export async function verifyPlatformTelephonyConnection(
  _previousState: PlatformTelephonyActionState,
  formData: FormData,
): Promise<PlatformTelephonyActionState> {
  await requirePlatformPermission('platform.telephony.manage')

  const integrationId = formString(formData, 'integrationId')
  const organizationId = formString(formData, 'organizationId')
  const providerValue = formString(formData, 'provider')

  if (!integrationId || !organizationId || !isTelephonyProvider(providerValue)) {
    return {
      status: 'error',
      message: 'The telephony connection information is incomplete.',
    }
  }

  const provider: ConfiguredTelephonyProviderName = providerValue

  try {
    const providerIdentity = await verifyProviderConnection(
      organizationId,
      provider,
    )

    const message = `${provider.toUpperCase()} verified successfully: ${providerIdentity}`
    await recordVerification({
      integrationId,
      success: true,
      message,
    })

    revalidatePath('/platform')
    revalidatePath('/platform/telephony')
    revalidatePath(`/platform/telephony/${integrationId}`)

    return { status: 'success', message }
  } catch (error) {
    const message = sanitizeProviderMessage(
      error,
      'Provider verification failed.',
    )

    try {
      await recordVerification({
        integrationId,
        success: false,
        message,
      })
    } catch {
      // Preserve the original provider failure as the user-facing error.
    }

    revalidatePath('/platform/telephony')
    revalidatePath(`/platform/telephony/${integrationId}`)

    return {
      status: 'error',
      message: `Provider verification failed: ${message}`,
    }
  }
}

export async function setPlatformTelephonyConnectionEnabled(
  _previousState: PlatformTelephonyActionState,
  formData: FormData,
): Promise<PlatformTelephonyActionState> {
  await requirePlatformPermission('platform.telephony.manage')

  const integrationId = formString(formData, 'integrationId')
  const reason = formString(formData, 'reason')
  const enabled = formString(formData, 'enabled') === 'true'

  if (!integrationId) {
    return { status: 'error', message: 'Integration ID is required.' }
  }

  if (reason.length < 10) {
    return {
      status: 'error',
      message: 'Enter a reason of at least 10 characters.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_set_telephony_connection_enabled',
    {
      p_integration_id: integrationId,
      p_enabled: enabled,
      p_reason: reason,
    },
  )

  if (error) {
    return {
      status: 'error',
      message: `Unable to update provider access: ${error.message}`,
    }
  }

  if (data !== true) {
    return {
      status: 'error',
      message: 'The provider connection was not updated.',
    }
  }

  revalidatePath('/platform')
  revalidatePath('/platform/telephony')
  revalidatePath(`/platform/telephony/${integrationId}`)
  revalidatePath('/dashboard', 'layout')

  return {
    status: 'success',
    message: enabled
      ? 'Provider connection re-enabled. Existing customer configuration and credentials were preserved.'
      : 'Provider connection disabled. Existing configuration and encrypted credentials were preserved.',
  }
}

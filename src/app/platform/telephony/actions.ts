'use server'

import { revalidatePath } from 'next/cache'

import { inboundSmsWebhookUrl, normalizeSmsNumber } from '@/lib/communications/sms-sender'
import { requirePlatformPermission } from '@/lib/platform/auth'
import { sanitizeProviderMessage } from '@/lib/platform/provider-security'
import { createClient } from '@/lib/supabase/server'
import { configureSignalWireSmsWebhook, listOwnedProviderNumbers, verifyProviderConnection } from '@/lib/telephony/provider-admin'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import {
  isTelephonyProvider,
  type ConfiguredTelephonyProviderName,
} from '@/lib/telephony/provider'

export type PlatformTelephonyActionState = {
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


export async function updatePlatformSmsSenderProvisioning(_previousState: PlatformTelephonyActionState, formData: FormData): Promise<PlatformTelephonyActionState> {
  await requirePlatformPermission('platform.telephony.manage')
  const requestId=formString(formData,'requestId'),integrationId=formString(formData,'integrationId'),status=formString(formData,'status'),reason=formString(formData,'reason'),providerReference=formString(formData,'providerReference')
  if(!requestId||!integrationId)return{status:'error',message:'The SMS provisioning request information is incomplete.'}
  if(!['provider_processing','action_required','rejected'].includes(status))return{status:'error',message:'Select a valid provisioning status.'}
  if(reason.length<5)return{status:'error',message:'Enter a provider note or reason of at least 5 characters.'}
  const supabase=await createClient();const{data,error}=await supabase.rpc('platform_mark_sms_sender_request',{p_request_id:requestId,p_status:status,p_reason:reason,p_provider_reference:providerReference||null})
  if(error||data!==true)return{status:'error',message:`Unable to update SMS provisioning: ${error?.message??'The request was not updated.'}`}
  revalidatePath(`/platform/telephony/${integrationId}`);revalidatePath('/dashboard/organization')
  return{status:'success',message:status==='provider_processing'?'Request marked as submitted to SignalWire. Use Sync & activate after the number appears as SMS-capable.':status==='action_required'?'Request marked as requiring subscriber action.':'Request marked as rejected.'}
}

export async function syncAndActivatePlatformSmsSender(_previousState: PlatformTelephonyActionState, formData: FormData): Promise<PlatformTelephonyActionState> {
  await requirePlatformPermission('platform.telephony.manage')
  const requestId=formString(formData,'requestId'),integrationId=formString(formData,'integrationId'),organizationId=formString(formData,'organizationId')
  if(!requestId||!integrationId||!organizationId)return{status:'error',message:'The SMS provisioning request information is incomplete.'}
  try{
    const admin=createTelephonyAdminClient();const{data:request,error:requestError}=await admin.from('organization_sms_sender_requests').select('id,organization_id,phone_number,status').eq('id',requestId).eq('organization_id',organizationId).maybeSingle();if(requestError)throw new Error(`Unable to load the SMS request: ${requestError.message}`);if(!request)throw new Error('The SMS provisioning request no longer exists.');if(['active','cancelled','replaced','rejected'].includes(request.status))throw new Error(`This request cannot be activated from its current ${request.status} state.`)
    const requestedNumber=normalizeSmsNumber(request.phone_number);const providerNumbers=await listOwnedProviderNumbers(organizationId,'signalwire');const providerNumber=providerNumbers.find(number=>{try{return normalizeSmsNumber(number.phoneNumber)===requestedNumber}catch{return false}})
    if(!providerNumber)return{status:'error',message:`${requestedNumber} is not present in the connected SignalWire account yet. Keep the request processing and retry after SignalWire approval.`}
    if(providerNumber.capabilities.sms!==true)return{status:'error',message:`${requestedNumber} exists in SignalWire but is not SMS-capable yet. Do not activate it until hosted messaging is ready.`}
    await configureSignalWireSmsWebhook({organizationId,providerNumberId:providerNumber.providerNumberId,smsUrl:inboundSmsWebhookUrl(organizationId,requestedNumber)})
    const supabase=await createClient();const{data,error}=await supabase.rpc('platform_activate_sms_sender_request',{p_request_id:requestId,p_provider_number_id:providerNumber.providerNumberId,p_friendly_name:providerNumber.friendlyName,p_capabilities:providerNumber.capabilities,p_provider_note:'SignalWire number synchronized, inbound SMS webhook configured, and company sender activated.'});if(error||data!==true)throw new Error(error?.message??'The provider number was configured, but Flowtix could not activate the sender record.')
    revalidatePath(`/platform/telephony/${integrationId}`);revalidatePath('/dashboard/organization');revalidatePath('/dashboard/settings/automation');revalidatePath('/dashboard/communications')
    return{status:'success',message:`${requestedNumber} is now the active Flowtix SMS sender. Outbound SMS and inbound replies use this company number.`}
  }catch(error){return{status:'error',message:sanitizeProviderMessage(error,'Unable to synchronize the SignalWire SMS number.')}}
}

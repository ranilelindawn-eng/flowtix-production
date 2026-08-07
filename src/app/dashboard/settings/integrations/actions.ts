'use server'

import { revalidatePath } from 'next/cache'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import { decryptIntegrationSecret, encryptIntegrationSecret } from '@/lib/integrations/crypto'
import {
  deleteEncryptedIntegrationSecret,
  getEncryptedIntegrationSecret,
  upsertEncryptedIntegrationSecret,
} from '@/lib/integrations/secret-store'
import { createGoogleCalendarEvent, sendGmailMessage, updateIntegrationHealth } from '@/lib/integrations/google-client'
import twilio from 'twilio'
import { isTelephonyProvider } from '@/lib/telephony/provider'
import { createTelnyxTelephonyCredential, listOwnedProviderNumbers, verifyProviderConnection } from '@/lib/telephony/provider-admin'

const supportedProviders = new Set([
  'twilio', 'telnyx', 'signalwire', 'plivo', 'openai', 'google-calendar',
  'gmail', 'outlook', 'slack', 'zoom', 'microsoft-teams', 'n8n', 'zapier',
])
const credentialProviders = new Set(['twilio', 'telnyx', 'signalwire', 'plivo', 'openai', 'n8n', 'zapier'])

function clean(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim()
}

export async function saveCredentialIntegration(formData: FormData) {
  const { supabase, organizationId, userId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')

  const provider = clean(formData, 'provider')
  if (!credentialProviders.has(provider)) throw new Error('Unsupported credential integration.')

  const credentials: Record<string, string> = {}
  const config: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (key === 'provider') continue
    const text = String(value).trim()
    if (!text) continue
    if (key.startsWith('config_')) config[key.slice(7)] = text
    else credentials[key] = text
  }
  if (Object.keys(credentials).length === 0) throw new Error('Enter the required provider credentials.')

  // Telnyx WebRTC JWTs require an on-demand Telephony Credential tied to the
  // subscriber-owned Credential SIP Connection. Flowtix creates it securely so
  // subscribers only provide their API key and Connection ID.
  if (provider === 'telnyx') {
    const apiKey = credentials.apiKey
    const connectionId = config.connection_id
    if (!apiKey) throw new Error('Telnyx API Key is required.')
    if (!connectionId) throw new Error('Telnyx Credential Connection ID is required.')

    // Validate that the connection belongs to the supplied Telnyx account before
    // creating the browser credential.
    const connectionResponse = await fetch(
      `https://api.telnyx.com/v2/credential_connections/${encodeURIComponent(connectionId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      },
    )
    if (!connectionResponse.ok) {
      const body = await connectionResponse.text()
      throw new Error(body || `Unable to validate the Telnyx connection (HTTP ${connectionResponse.status}).`)
    }

    const telephonyCredential = await createTelnyxTelephonyCredential(
      apiKey,
      connectionId,
      `Flowtix ${organizationId} WebRTC`,
    )
    credentials.telephonyCredentialId = telephonyCredential.id
  }

  const { data: integration, error } = await supabase.from('organization_integrations').upsert({
    organization_id: organizationId,
    provider,
    enabled: true,
    status: 'connected',
    config,
    connected_by: userId,
    connected_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,provider' }).select('id').single()
  if (error || !integration) throw new Error(error?.message || 'Unable to save integration.')

  await upsertEncryptedIntegrationSecret({
    integrationId: integration.id,
    organizationId,
    encryptedCredentials: encryptIntegrationSecret(credentials),
    credentialVersion: 1,
  })
  revalidatePath('/dashboard/settings/integrations')
}

export async function disconnectIntegration(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')
  const provider = clean(formData, 'provider')
  if (!supportedProviders.has(provider)) throw new Error('Unsupported integration provider.')

  const { data: integration, error: integrationError } = await supabase.from('organization_integrations')
    .select('id').eq('organization_id', organizationId).eq('provider', provider).maybeSingle()
  if (integrationError) throw new Error(integrationError.message)
  if (integration) {
    await deleteEncryptedIntegrationSecret({
      organizationId,
      integrationId: integration.id,
    })
  }

  const { error } = await supabase.from('organization_integrations').upsert({
    organization_id: organizationId,
    provider,
    enabled: false,
    status: 'disconnected',
    config: {},
    connected_by: null,
    connected_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,provider' })
  if (error) throw new Error(`Unable to disconnect integration: ${error.message}`)
  revalidatePath('/dashboard/settings/integrations')
}


export async function testGmailIntegration() {
  const { organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')
  try {
    const { supabase } = await requireSettingsContext()
    const { data } = await supabase.from('organization_integrations').select('config').eq('organization_id', organizationId).eq('provider', 'gmail').single()
    const email = typeof data?.config?.connected_email === 'string' ? data.config.connected_email : null
    if (!email) throw new Error('Connected Gmail address is unavailable.')
    await sendGmailMessage(organizationId, {
      to: email,
      subject: 'Flowtix Gmail connection test',
      body: 'Your subscriber-owned Gmail integration is working correctly. This message was sent by Flowtix.',
    })
    await updateIntegrationHealth(organizationId, 'gmail', { ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gmail connection test failed.'
    await updateIntegrationHealth(organizationId, 'gmail', { ok: false, message })
    throw new Error(message)
  }
  revalidatePath('/dashboard/settings/integrations')
}

export async function testGoogleCalendarIntegration() {
  const { organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')
  try {
    const start = new Date(Date.now() + 10 * 60 * 1000)
    const end = new Date(start.getTime() + 15 * 60 * 1000)
    await createGoogleCalendarEvent(organizationId, {
      summary: 'Flowtix calendar connection test',
      description: 'This event confirms that the subscriber-owned Google Calendar integration is working.',
      start,
      end,
    })
    await updateIntegrationHealth(organizationId, 'google-calendar', { ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Calendar connection test failed.'
    await updateIntegrationHealth(organizationId, 'google-calendar', { ok: false, message })
    throw new Error(message)
  }
  revalidatePath('/dashboard/settings/integrations')
}


export async function testTwilioIntegration() {
  const { supabase, organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')

  const { data: integration, error: integrationError } = await supabase
    .from('organization_integrations')
    .select('id, config')
    .eq('organization_id', organizationId)
    .eq('provider', 'twilio')
    .maybeSingle()

  if (integrationError) throw new Error(integrationError.message)
  if (!integration) throw new Error('Connect Twilio before testing it.')

  const encryptedCredentials = await getEncryptedIntegrationSecret({
    organizationId,
    integrationId: integration.id,
  })

  if (!encryptedCredentials) {
    throw new Error('Twilio credentials are unavailable.')
  }

  try {
    const credentials = decryptIntegrationSecret<{
      accountSid?: string
      authToken?: string
      apiKeySid?: string
      apiKeySecret?: string
      twimlAppSid?: string
    }>(encryptedCredentials)

    if (!credentials.accountSid || !credentials.authToken) {
      throw new Error('Twilio Account SID and Auth Token are required.')
    }

    const client = twilio(credentials.accountSid, credentials.authToken)
    const account = await client.api.accounts(credentials.accountSid).fetch()
    const configuredNumber = typeof integration.config?.phone_number === 'string'
      ? integration.config.phone_number
      : null

    if (configuredNumber) {
      const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: configuredNumber, limit: 1 })
      if (numbers.length === 0) {
        throw new Error('The configured phone number was not found in this Twilio account.')
      }
    }

    await supabase.from('organization_integrations').update({
      status: 'connected',
      enabled: true,
      last_error: null,
      last_tested_at: new Date().toISOString(),
      last_test_status: 'passed',
      config: {
        ...(integration.config ?? {}),
        connected_name: account.friendlyName || account.sid,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', integration.id).eq('organization_id', organizationId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Twilio connection test failed.'
    await supabase.from('organization_integrations').update({
      status: 'error',
      last_error: message,
      last_tested_at: new Date().toISOString(),
      last_test_status: 'failed',
      updated_at: new Date().toISOString(),
    }).eq('id', integration.id).eq('organization_id', organizationId)
    throw new Error(message)
  }

  revalidatePath('/dashboard/settings/integrations')
}


async function loadTwilioConnection() {
  const context = await requireSettingsContext()
  const { supabase, organizationId, role } = context
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')

  const { data: integration, error: integrationError } = await supabase
    .from('organization_integrations')
    .select('id, config')
    .eq('organization_id', organizationId)
    .eq('provider', 'twilio')
    .maybeSingle()

  if (integrationError) throw new Error(integrationError.message)
  if (!integration) throw new Error('Connect Twilio before importing phone numbers.')

  const encryptedCredentials = await getEncryptedIntegrationSecret({
    organizationId,
    integrationId: integration.id,
  })

  if (!encryptedCredentials) {
    throw new Error('Twilio credentials are unavailable.')
  }

  const credentials = decryptIntegrationSecret<{ accountSid?: string; authToken?: string }>(
    encryptedCredentials,
  )
  if (!credentials.accountSid || !credentials.authToken) {
    throw new Error('Twilio Account SID and Auth Token are required.')
  }

  return {
    ...context,
    integration,
    client: twilio(credentials.accountSid, credentials.authToken),
  }
}

export async function syncTwilioPhoneNumbers() {
  const { supabase, organizationId, integration, client } = await loadTwilioConnection()

  try {
    const remoteNumbers = await client.incomingPhoneNumbers.list({ limit: 1000 })
    if (remoteNumbers.length === 0) {
      throw new Error('No active phone numbers were found in this Twilio account.')
    }

    const { data: currentDefault, error: currentDefaultError } = await supabase
      .from('organization_phone_numbers')
      .select('phone_number')
      .eq('organization_id', organizationId)
      .eq('provider', 'twilio')
      .eq('is_default', true)
      .maybeSingle()

    if (currentDefaultError) throw new Error(currentDefaultError.message)

    const remotePhoneNumbers = new Set(remoteNumbers.map((number) => number.phoneNumber))
    const selectedDefault = currentDefault?.phone_number && remotePhoneNumbers.has(currentDefault.phone_number)
      ? currentDefault.phone_number
      : remoteNumbers[0].phoneNumber

    if (currentDefault?.phone_number && !remotePhoneNumbers.has(currentDefault.phone_number)) {
      const { error: clearDefaultError } = await supabase
        .from('organization_phone_numbers')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('provider', 'twilio')
      if (clearDefaultError) throw new Error(clearDefaultError.message)
    }

    const rows = remoteNumbers.map((number) => ({
      organization_id: organizationId,
      provider: 'twilio',
      provider_number_id: number.sid,
      phone_number: number.phoneNumber,
      friendly_name: number.friendlyName || number.phoneNumber,
      capabilities: {
        voice: Boolean(number.capabilities?.voice),
        sms: Boolean(number.capabilities?.sms),
        mms: Boolean(number.capabilities?.mms),
        fax: Boolean(number.capabilities?.fax),
      },
      is_default: number.phoneNumber === selectedDefault,
      updated_at: new Date().toISOString(),
    }))

    const { error: upsertError } = await supabase
      .from('organization_phone_numbers')
      .upsert(rows, { onConflict: 'organization_id,phone_number' })

    if (upsertError) throw new Error(upsertError.message)

    const { error: integrationUpdateError } = await supabase
      .from('organization_integrations')
      .update({
        status: 'connected',
        enabled: true,
        last_error: null,
        last_tested_at: new Date().toISOString(),
        last_test_status: 'passed',
        config: {
          ...(integration.config ?? {}),
          phone_number: selectedDefault,
          imported_phone_number_count: rows.length,
          phone_numbers_synced_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id)
      .eq('organization_id', organizationId)

    if (integrationUpdateError) throw new Error(integrationUpdateError.message)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to import Twilio phone numbers.'
    await supabase
      .from('organization_integrations')
      .update({
        status: 'error',
        last_error: message,
        last_tested_at: new Date().toISOString(),
        last_test_status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id)
      .eq('organization_id', organizationId)
    throw new Error(message)
  }

  revalidatePath('/dashboard/settings/integrations')
  revalidatePath('/dashboard/settings/phone-numbers')
}

export async function setTwilioDefaultPhoneNumber(formData: FormData) {
  const { supabase, organizationId, integration, client } = await loadTwilioConnection()
  const phoneNumber = clean(formData, 'phone_number')
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    throw new Error('Select a valid Twilio phone number.')
  }

  const remoteMatch = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 })
  if (remoteMatch.length === 0) {
    throw new Error('That phone number does not belong to the connected Twilio account.')
  }

  const { error: clearError } = await supabase
    .from('organization_phone_numbers')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('provider', 'twilio')
  if (clearError) throw new Error(clearError.message)

  const { error: setError } = await supabase
    .from('organization_phone_numbers')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('provider', 'twilio')
    .eq('phone_number', phoneNumber)
  if (setError) throw new Error(setError.message)

  const { error: integrationError } = await supabase
    .from('organization_integrations')
    .update({
      config: { ...(integration.config ?? {}), phone_number: phoneNumber },
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id)
    .eq('organization_id', organizationId)
  if (integrationError) throw new Error(integrationError.message)

  revalidatePath('/dashboard/settings/integrations')
  revalidatePath('/dashboard/settings/phone-numbers')
}


export async function testTelephonyIntegration(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')
  const provider = clean(formData, 'provider')
  if (!isTelephonyProvider(provider)) throw new Error('Unsupported telephony provider.')
  const { data: integration, error } = await supabase.from('organization_integrations')
    .select('id,config').eq('organization_id', organizationId).eq('provider', provider).maybeSingle()
  if (error) throw new Error(error.message)
  if (!integration) throw new Error(`Connect ${provider} before testing it.`)
  try {
    const connectedName = await verifyProviderConnection(organizationId, provider)
    const { error: updateError } = await supabase.from('organization_integrations').update({
      enabled: true, status: 'connected', last_error: null,
      last_tested_at: new Date().toISOString(), last_test_status: 'passed',
      config: { ...(integration.config ?? {}), connected_name: connectedName }, updated_at: new Date().toISOString(),
    }).eq('id', integration.id).eq('organization_id', organizationId)
    if (updateError) throw new Error(updateError.message)
  } catch (error) {
    const message = error instanceof Error ? error.message : `${provider} connection test failed.`
    await supabase.from('organization_integrations').update({ status: 'error', last_error: message, last_tested_at: new Date().toISOString(), last_test_status: 'failed', updated_at: new Date().toISOString() }).eq('id', integration.id).eq('organization_id', organizationId)
    throw new Error(message)
  }
  revalidatePath('/dashboard/settings/integrations')
}

export async function syncTelephonyPhoneNumbers(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')
  const provider = clean(formData, 'provider')
  if (!isTelephonyProvider(provider)) throw new Error('Unsupported telephony provider.')
  const numbers = await listOwnedProviderNumbers(organizationId, provider)
  if (!numbers.length) throw new Error(`No active phone numbers were found in the connected ${provider} account.`)

  const { data: existingDefault, error: defaultError } = await supabase.from('organization_phone_numbers')
    .select('phone_number').eq('organization_id', organizationId).eq('provider', provider).eq('is_default', true).maybeSingle()
  if (defaultError) throw new Error(defaultError.message)
  const owned = new Set(numbers.map((number) => number.phoneNumber))
  const selectedDefault = existingDefault?.phone_number && owned.has(existingDefault.phone_number) ? existingDefault.phone_number : numbers[0].phoneNumber
  const rows = numbers.map((number) => ({ organization_id: organizationId, provider, provider_number_id: number.providerNumberId, phone_number: number.phoneNumber, friendly_name: number.friendlyName, capabilities: number.capabilities, is_default: number.phoneNumber === selectedDefault, updated_at: new Date().toISOString() }))
  const { error: upsertError } = await supabase.from('organization_phone_numbers').upsert(rows, { onConflict: 'organization_id,phone_number' })
  if (upsertError) throw new Error(upsertError.message)
  const { data: integration, error: integrationError } = await supabase.from('organization_integrations').select('id,config').eq('organization_id', organizationId).eq('provider', provider).single()
  if (integrationError) throw new Error(integrationError.message)
  const { error: updateError } = await supabase.from('organization_integrations').update({ status: 'connected', enabled: true, last_error: null, last_tested_at: new Date().toISOString(), last_test_status: 'passed', config: { ...(integration.config ?? {}), phone_number: selectedDefault, imported_phone_number_count: rows.length, phone_numbers_synced_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('id', integration.id).eq('organization_id', organizationId)
  if (updateError) throw new Error(updateError.message)
  revalidatePath('/dashboard/settings/integrations')
  revalidatePath('/dashboard/settings/phone-numbers')
  revalidatePath('/dashboard/dialer')
}

export async function setDefaultTelephonyPhoneNumber(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')
  const provider = clean(formData, 'provider')
  const phoneNumber = clean(formData, 'phone_number')
  if (!isTelephonyProvider(provider)) throw new Error('Unsupported telephony provider.')
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) throw new Error('Select a valid E.164 phone number.')
  const numbers = await listOwnedProviderNumbers(organizationId, provider)
  if (!numbers.some((number) => number.phoneNumber === phoneNumber)) throw new Error(`That number does not belong to the connected ${provider} account.`)
  const { error: clearError } = await supabase.from('organization_phone_numbers').update({ is_default: false, updated_at: new Date().toISOString() }).eq('organization_id', organizationId)
  if (clearError) throw new Error(clearError.message)
  const { error: setError } = await supabase.from('organization_phone_numbers').update({ is_default: true, updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('provider', provider).eq('phone_number', phoneNumber)
  if (setError) throw new Error(setError.message)
  revalidatePath('/dashboard/settings/integrations')
  revalidatePath('/dashboard/settings/phone-numbers')
  revalidatePath('/dashboard/dialer')
}

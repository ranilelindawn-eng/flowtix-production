'use server'

import { revalidatePath } from 'next/cache'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import { encryptIntegrationSecret } from '@/lib/integrations/crypto'
import {
  deleteEncryptedIntegrationSecret,
  upsertEncryptedIntegrationSecret,
} from '@/lib/integrations/secret-store'
import { createGoogleCalendarEvent, sendGmailMessage, updateIntegrationHealth } from '@/lib/integrations/google-client'
import { isTelephonyProvider } from '@/lib/telephony/provider'
import { listOwnedProviderNumbers, verifyProviderConnection } from '@/lib/telephony/provider-admin'

const supportedProviders = new Set([
  'signalwire', 'openai', 'google-calendar',
  'gmail', 'outlook', 'slack', 'zoom', 'microsoft-teams', 'n8n', 'zapier',
])
const credentialProviders = new Set(['signalwire', 'openai', 'n8n', 'zapier'])

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

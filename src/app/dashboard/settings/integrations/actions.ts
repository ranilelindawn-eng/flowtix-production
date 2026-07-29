'use server'

import { revalidatePath } from 'next/cache'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import { encryptIntegrationSecret } from '@/lib/integrations/crypto'
import { createGoogleCalendarEvent, sendGmailMessage, updateIntegrationHealth } from '@/lib/integrations/google-client'

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

  const { error: secretError } = await supabase.from('organization_integration_secrets').upsert({
    integration_id: integration.id,
    organization_id: organizationId,
    encrypted_credentials: encryptIntegrationSecret(credentials),
    credential_version: 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'integration_id' })
  if (secretError) throw new Error(secretError.message)
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
    const { error: secretError } = await supabase.from('organization_integration_secrets')
      .delete().eq('organization_id', organizationId).eq('integration_id', integration.id)
    if (secretError) throw new Error(secretError.message)
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
      subject: 'CallFlow Gmail connection test',
      body: 'Your subscriber-owned Gmail integration is working correctly. This message was sent by CallFlow.',
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
      summary: 'CallFlow calendar connection test',
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

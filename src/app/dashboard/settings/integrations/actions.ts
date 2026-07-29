'use server'

import { revalidatePath } from 'next/cache'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'

const supportedProviders = new Set([
  'twilio', 'telnyx', 'signalwire', 'plivo', 'openai', 'google-calendar',
  'gmail', 'outlook', 'slack', 'zoom', 'microsoft-teams', 'n8n', 'zapier',
])

export async function disconnectIntegration(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')

  const provider = String(formData.get('provider') ?? '').trim()
  if (!supportedProviders.has(provider)) throw new Error('Unsupported integration provider.')

  const { data: integration, error: integrationError } = await supabase
    .from('organization_integrations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('provider', provider)
    .maybeSingle()

  if (integrationError) throw new Error(integrationError.message)
  if (integration) {
    const { error: secretError } = await supabase
      .from('organization_integration_secrets')
      .delete()
      .eq('organization_id', organizationId)
      .eq('integration_id', integration.id)
    if (secretError) throw new Error(secretError.message)
  }

  const { error } = await supabase
    .from('organization_integrations')
    .upsert({
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

'use server'
import { revalidatePath } from 'next/cache'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
const clean = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
export async function saveIntegration(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')
  const provider = clean(formData, 'provider')
  const enabled = formData.get('enabled') === 'on'
  const config = { account_label: clean(formData, 'account_label'), webhook_url: clean(formData, 'webhook_url') }
  const { error } = await supabase.from('organization_integrations').upsert({ organization_id: organizationId, provider, enabled, status: enabled ? 'configured' : 'disconnected', config, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,provider' })
  if (error) throw new Error(`Unable to save integration: ${error.message}`)
  revalidatePath('/dashboard/settings/integrations')
}

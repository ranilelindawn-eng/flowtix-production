'use server'
import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { assertEntitlement } from '@/lib/entitlements'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'

const clean = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()

export async function createApiKey(formData: FormData) {
  const { supabase, userId, organizationId, role } = await requireSettingsContext()
  await assertEntitlement('api.access', organizationId)
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')
  const name = clean(formData, 'name')
  if (!name) throw new Error('API key name is required.')
  const scopes = formData.getAll('scopes').map(String).filter(Boolean)
  const secret = `cf_live_${randomBytes(24).toString('base64url')}`
  const prefix = secret.slice(0, 15)
  const keyHash = createHash('sha256').update(secret).digest('hex')
  const { error } = await supabase.from('api_keys').insert({ organization_id: organizationId, name, key_prefix: prefix, key_hash: keyHash, scopes, created_by: userId })
  if (error) throw new Error(`Unable to create API key: ${error.message}`)
  revalidatePath('/dashboard/settings/api-keys')
  redirect(`/dashboard/settings/api-keys?created=${encodeURIComponent(secret)}`)
}

export async function revokeApiKey(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()
  await assertEntitlement('api.access', organizationId)
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')
  const id = clean(formData, 'id')
  const { error } = await supabase.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('organization_id', organizationId)
  if (error) throw new Error(`Unable to revoke API key: ${error.message}`)
  revalidatePath('/dashboard/settings/api-keys')
}

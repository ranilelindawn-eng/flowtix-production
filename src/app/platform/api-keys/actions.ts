'use server'

import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

export type CreatePlatformApiKeyState = {
  ok: boolean
  error: string | null
  secret: string | null
}

const allowedScopes = new Set([
  'contacts:read',
  'contacts:write',
  'calls:read',
  'calls:write',
  'reports:read',
])

const clean = (formData: FormData, key: string): string =>
  String(formData.get(key) ?? '').trim()

export async function createPlatformApiKey(
  _previousState: CreatePlatformApiKeyState,
  formData: FormData,
): Promise<CreatePlatformApiKeyState> {
  await requirePlatformPermission('platform.api_keys.manage')

  const organizationId = clean(formData, 'organizationId')
  const name = clean(formData, 'name')
  const reason = clean(formData, 'reason')
  const scopes = formData
    .getAll('scopes')
    .map(String)
    .filter((scope) => allowedScopes.has(scope))

  if (!organizationId) {
    return { ok: false, error: 'An organization is required.', secret: null }
  }

  if (!name) {
    return { ok: false, error: 'API key name is required.', secret: null }
  }

  if (reason.length < 10) {
    return {
      ok: false,
      error: 'Enter an audit reason with at least 10 characters.',
      secret: null,
    }
  }

  const secret = `cf_live_${randomBytes(24).toString('base64url')}`
  const keyPrefix = secret.slice(0, 15)
  const keyHash = createHash('sha256').update(secret).digest('hex')
  const supabase = await createClient()

  const { error } = await supabase.rpc('platform_create_api_key', {
    p_organization_id: organizationId,
    p_name: name,
    p_key_prefix: keyPrefix,
    p_key_hash: keyHash,
    p_scopes: scopes,
    p_reason: reason,
  })

  if (error) {
    return {
      ok: false,
      error: error.message,
      secret: null,
    }
  }

  revalidatePath('/platform/api-keys')

  return { ok: true, error: null, secret }
}

export async function revokePlatformApiKey(formData: FormData) {
  await requirePlatformPermission('platform.api_keys.manage')

  const organizationId = clean(formData, 'organizationId')
  const keyId = clean(formData, 'keyId')
  const reason = clean(formData, 'reason')

  if (!organizationId || !keyId) {
    throw new Error('Organization and API key are required.')
  }

  if (reason.length < 10) {
    throw new Error('Enter an audit reason with at least 10 characters.')
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('platform_revoke_api_key', {
    p_organization_id: organizationId,
    p_key_id: keyId,
    p_reason: reason,
  })

  if (error) {
    throw new Error(`Unable to revoke API key: ${error.message}`)
  }

  revalidatePath('/platform/api-keys')
}

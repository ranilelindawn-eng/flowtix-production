import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { encryptIntegrationSecret } from '@/lib/integrations/crypto'
import { getProductionOrigin, verifyIntegrationState } from '@/lib/integrations/oauth-state'
import { exchangeProviderCode, fetchProviderIdentity, type ExternalOAuthProvider } from '@/lib/integrations/provider-oauth'

export async function GET(request: NextRequest) {
  const origin = getProductionOrigin(request.nextUrl.origin)
  const go = (key: string, value: string) => {
    const url = new URL('/dashboard/settings/integrations', origin)
    url.searchParams.set(key, value)
    return NextResponse.redirect(url)
  }

  try {
    const providerError = request.nextUrl.searchParams.get('error')
    if (providerError) return go('error', providerError)
    const code = request.nextUrl.searchParams.get('code')
    const stateRaw = request.nextUrl.searchParams.get('state')
    if (!code || !stateRaw) return go('error', 'missing-oauth-callback-data')

    const state = verifyIntegrationState(stateRaw)
    const provider = state.provider as ExternalOAuthProvider
    if (!['outlook', 'microsoft-teams', 'slack', 'zoom'].includes(provider)) return go('error', 'unsupported-oauth-provider')

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login?error=integration-session-expired', origin))
    if (user.id !== state.userId) return go('error', 'integration-session-changed')

    const { data: membership } = await supabase.from('organization_members').select('role,status')
      .eq('organization_id', state.organizationId).eq('user_id', user.id).eq('status', 'active').maybeSingle()
    if (!membership || !['owner', 'admin'].includes(membership.role)) return go('error', 'insufficient-permission')

    const tokenData = await exchangeProviderCode(provider, origin, code)
    const identity = await fetchProviderIdentity(provider, tokenData)
    const expiresIn = typeof tokenData.expires_in === 'number' ? tokenData.expires_in : 3600
    const encrypted = encryptIntegrationSecret({ ...tokenData, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() })

    const { data: integration, error } = await supabase.from('organization_integrations').upsert({
      organization_id: state.organizationId,
      provider,
      enabled: true,
      status: 'connected',
      config: { connected_email: identity.email, connected_name: identity.name, provider_account_id: identity.id },
      connected_by: user.id,
      connected_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider' }).select('id').single()
    if (error || !integration) throw new Error(error?.message || 'Unable to save integration.')

    const { error: secretError } = await supabase.from('organization_integration_secrets').upsert({
      integration_id: integration.id,
      organization_id: state.organizationId,
      encrypted_credentials: encrypted,
      credential_version: 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'integration_id' })
    if (secretError) throw new Error(secretError.message)
    return go('connected', provider)
  } catch (error) {
    console.error('OAuth integration callback failed:', error)
    return go('error', 'provider-connection-failed')
  }
}

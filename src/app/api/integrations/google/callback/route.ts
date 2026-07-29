import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { encryptIntegrationSecret } from '@/lib/integrations/crypto'
import { getGoogleOAuthConfig, verifyGoogleState } from '@/lib/integrations/google-oauth'

export async function GET(request: NextRequest) {
  const redirect = (params: string) => NextResponse.redirect(
    new URL(`/dashboard/settings/integrations?${params}`, request.url),
  )

  try {
    const providerError = request.nextUrl.searchParams.get('error')
    if (providerError) return redirect(`error=${encodeURIComponent(providerError)}`)

    const code = request.nextUrl.searchParams.get('code')
    const stateValue = request.nextUrl.searchParams.get('state')
    if (!code || !stateValue) return redirect('error=missing-google-callback-data')

    const state = verifyGoogleState(stateValue)
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id !== state.userId) return redirect('error=oauth-user-mismatch')

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role,status')
      .eq('organization_id', state.organizationId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return redirect('error=insufficient-permission')
    }

    const config = getGoogleOAuthConfig(request.nextUrl.origin)
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
    })

    const tokens = await tokenResponse.json() as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      scope?: string
      token_type?: string
      id_token?: string
      error_description?: string
    }
    if (!tokenResponse.ok || !tokens.access_token) {
      throw new Error(tokens.error_description || 'Google token exchange failed.')
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: 'no-store',
    })
    const profile = await profileResponse.json() as { sub?: string; email?: string; name?: string; picture?: string }
    if (!profileResponse.ok || !profile.email) throw new Error('Unable to read the connected Google account.')

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()
    const encrypted = encryptIntegrationSecret({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scope: tokens.scope,
      tokenType: tokens.token_type,
    })

    const { data: integration, error: integrationError } = await supabase
      .from('organization_integrations')
      .upsert({
        organization_id: state.organizationId,
        provider: 'gmail',
        enabled: true,
        status: 'connected',
        config: {
          connected_email: profile.email,
          connected_name: profile.name ?? profile.email,
          provider_account_id: profile.sub ?? null,
          avatar_url: profile.picture ?? null,
          scopes: tokens.scope?.split(' ') ?? [],
        },
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,provider' })
      .select('id')
      .single()

    if (integrationError || !integration) throw new Error(integrationError?.message || 'Unable to save Gmail integration.')

    const { error: secretError } = await supabase
      .from('organization_integration_secrets')
      .upsert({
        integration_id: integration.id,
        organization_id: state.organizationId,
        encrypted_credentials: encrypted,
        credential_version: 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'integration_id' })

    if (secretError) throw new Error(`Unable to save encrypted Gmail credentials: ${secretError.message}`)
    return redirect('connected=gmail')
  } catch (error) {
    console.error('Google integration callback failed:', error)
    return redirect('error=google-connection-failed')
  }
}

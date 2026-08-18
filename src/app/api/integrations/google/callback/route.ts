import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { encryptIntegrationSecret } from '@/lib/integrations/crypto'
import { upsertEncryptedIntegrationSecret } from '@/lib/integrations/secret-store'
import { getGoogleOAuthConfig, verifyGoogleState } from '@/lib/integrations/google-oauth'
import { getProductionOrigin } from '@/lib/integrations/oauth-state'
import { enqueueJob } from '@/lib/jobs/queue'

export async function GET(request: NextRequest) {
  const origin = getProductionOrigin(request.nextUrl.origin)
  const redirect = (params: Record<string, string>) => {
    const url = new URL('/dashboard/settings/integrations', origin)
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    return NextResponse.redirect(url)
  }

  try {
    const providerError = request.nextUrl.searchParams.get('error')
    if (providerError) return redirect({ error: providerError })

    const code = request.nextUrl.searchParams.get('code')
    const stateValue = request.nextUrl.searchParams.get('state')
    if (!code || !stateValue) return redirect({ error: 'missing-google-callback-data' })

    const state = verifyGoogleState(stateValue)
    if (state.provider !== 'gmail' && state.provider !== 'google-calendar') {
      return redirect({ error: 'unsupported-google-service' })
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const login = new URL('/login', origin)
      login.searchParams.set('error', 'integration-session-expired')
      return NextResponse.redirect(login)
    }
    if (user.id !== state.userId) return redirect({ error: 'integration-session-changed' })

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role,status')
      .eq('organization_id', state.organizationId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return redirect({ error: 'insufficient-permission' })
    }

    const config = getGoogleOAuthConfig(origin)
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
      error_description?: string
    }
    if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error_description || 'Google token exchange failed.')

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
        provider: state.provider,
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

    if (integrationError || !integration) throw new Error(integrationError?.message || 'Unable to save Google integration.')

    await upsertEncryptedIntegrationSecret({
      integrationId: integration.id,
      organizationId: state.organizationId,
      encryptedCredentials: encrypted,
      credentialVersion: 1,
    })

    if (state.provider === 'gmail') {
      try {
        const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        await enqueueJob({
          organizationId: state.organizationId,
          queue: 'communications',
          jobType: 'communications.gmail_watch_renew',
          payload: { organizationId: state.organizationId },
          priority: 60,
          maxAttempts: 5,
          idempotencyKey: `gmail-watch-connect:${integration.id}:${dateKey}`,
        })
      } catch (watchError) {
        console.warn('Gmail connected, but the inbox watch could not be queued yet.', watchError)
      }
    }

    return redirect({ connected: state.provider })
  } catch (error) {
    console.error('Google integration callback failed:', error)
    return redirect({ error: 'google-connection-failed' })
  }
}

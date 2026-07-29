import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import { createIntegrationState, getProductionOrigin } from '@/lib/integrations/oauth-state'
import { buildProviderAuthorizationUrl, type ExternalOAuthProvider } from '@/lib/integrations/provider-oauth'

const providers = new Set<ExternalOAuthProvider>(['outlook', 'microsoft-teams', 'slack', 'zoom'])

export async function GET(request: NextRequest) {
  const origin = getProductionOrigin(request.nextUrl.origin)
  const redirect = new URL('/dashboard/settings/integrations', origin)
  try {
    const provider = request.nextUrl.searchParams.get('provider') as ExternalOAuthProvider | null
    if (!provider || !providers.has(provider)) {
      redirect.searchParams.set('error', 'unsupported-oauth-provider')
      return NextResponse.redirect(redirect)
    }
    const { organizationId, userId, role } = await requireSettingsContext()
    if (!canManageSettings(role)) {
      redirect.searchParams.set('error', 'insufficient-permission')
      return NextResponse.redirect(redirect)
    }
    const state = createIntegrationState({ organizationId, userId, provider, expiresAt: Date.now() + 10 * 60 * 1000, nonce: randomBytes(16).toString('hex') })
    return NextResponse.redirect(buildProviderAuthorizationUrl(provider, origin, state))
  } catch (error) {
    console.error('OAuth integration start failed:', error)
    redirect.searchParams.set('error', 'provider-config-missing')
    return NextResponse.redirect(redirect)
  }
}

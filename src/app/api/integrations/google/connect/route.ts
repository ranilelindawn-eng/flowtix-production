import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireSettingsContext, canManageSettings } from '@/lib/settings-context'
import { buildGoogleAuthorizationUrl, createGoogleState, type GoogleService } from '@/lib/integrations/google-oauth'
import { getProductionOrigin } from '@/lib/integrations/oauth-state'

export async function GET(request: NextRequest) {
  const origin = getProductionOrigin(request.nextUrl.origin)
  const integrationsUrl = new URL('/dashboard/settings/integrations', origin)

  try {
    const service = request.nextUrl.searchParams.get('service') as GoogleService | null
    if (service !== 'gmail' && service !== 'google-calendar') {
      integrationsUrl.searchParams.set('error', 'unsupported-google-service')
      return NextResponse.redirect(integrationsUrl)
    }

    const { organizationId, userId, role } = await requireSettingsContext()
    if (!canManageSettings(role)) {
      integrationsUrl.searchParams.set('error', 'insufficient-permission')
      return NextResponse.redirect(integrationsUrl)
    }

    const state = createGoogleState({
      organizationId,
      userId,
      provider: service,
      expiresAt: Date.now() + 10 * 60 * 1000,
      nonce: randomBytes(16).toString('hex'),
    })

    return NextResponse.redirect(buildGoogleAuthorizationUrl(origin, state, service))
  } catch (error) {
    console.error('Google integration start failed:', error)
    integrationsUrl.searchParams.set('error', 'google-config-missing')
    return NextResponse.redirect(integrationsUrl)
  }
}

import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireSettingsContext, canManageSettings } from '@/lib/settings-context'
import { buildGoogleAuthorizationUrl, createGoogleState } from '@/lib/integrations/google-oauth'

export async function GET(request: NextRequest) {
  try {
    const service = request.nextUrl.searchParams.get('service')
    if (service !== 'gmail') {
      return NextResponse.redirect(new URL('/dashboard/settings/integrations?error=unsupported-google-service', request.url))
    }

    const { organizationId, userId, role } = await requireSettingsContext()
    if (!canManageSettings(role)) {
      return NextResponse.redirect(new URL('/dashboard/settings/integrations?error=insufficient-permission', request.url))
    }

    const state = createGoogleState({
      organizationId,
      userId,
      service,
      expiresAt: Date.now() + 10 * 60 * 1000,
      nonce: randomBytes(16).toString('hex'),
    })

    return NextResponse.redirect(buildGoogleAuthorizationUrl(request.nextUrl.origin, state))
  } catch (error) {
    console.error('Google integration start failed:', error)
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?error=google-config-missing', request.url))
  }
}

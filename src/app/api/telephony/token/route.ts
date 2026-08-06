import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import {
  createTelnyxWebRtcToken,
  getOrganizationTelnyxConfiguration,
  getOrganizationTwilioConfiguration,
} from '@/lib/telephony/config'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    const userId = data?.claims?.sub
    const organization = await getCurrentOrganization()
    if (typeof userId !== 'string' || !organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!hasPermission(organization.role, 'calls.create')) {
      return NextResponse.json({ error: 'You do not have permission to place calls.' }, { status: 403 })
    }
    await assertEntitlement('dialer.cloud', organization.organization_id)

    const requestedProvider = request.nextUrl.searchParams.get('provider')
    if (requestedProvider !== 'twilio' && requestedProvider !== 'telnyx') {
      return NextResponse.json({ error: 'A supported provider is required.' }, { status: 400 })
    }

    if (requestedProvider === 'telnyx') {
      const config = await getOrganizationTelnyxConfiguration(organization.organization_id)
      const token = await createTelnyxWebRtcToken(config)
      return NextResponse.json({
        provider: 'telnyx',
        token,
        identity: `fx_${userId.replace(/-/g, '')}`,
        userId,
        organizationId: organization.organization_id,
        callerId: config.callerId,
        expiresIn: 86400,
      })
    }

    const config = await getOrganizationTwilioConfiguration(organization.organization_id)
    const identity = `cf_${userId.replace(/-/g, '')}`
    const AccessToken = twilio.jwt.AccessToken
    const token = new AccessToken(config.accountSid, config.apiKeySid, config.apiKeySecret, {
      identity,
      ttl: 3600,
    })
    token.addGrant(new AccessToken.VoiceGrant({
      outgoingApplicationSid: config.twimlAppSid,
      incomingAllow: true,
    }))

    return NextResponse.json({
      provider: 'twilio',
      token: token.toJwt(),
      identity,
      userId,
      organizationId: organization.organization_id,
      callerId: config.callerId,
      expiresIn: 3600,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create Voice token.' },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

import { Buffer } from 'node:buffer'

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
import { getOrganizationProviderConnection } from '@/lib/telephony/provider-connections'
import {
  isTelephonyProvider,
  type ConfiguredTelephonyProviderName,
} from '@/lib/telephony/provider'

function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`)
  }
  return value.trim()
}

function normalizeSpaceUrl(value: unknown): string {
  const raw = required(value, 'SignalWire Space URL').replace(/\/$/, '')
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

async function validateSelectedCallerId(input: {
  organizationId: string
  provider: ConfiguredTelephonyProviderName
  callerId: string
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_phone_numbers')
    .select('phone_number,capabilities')
    .eq('organization_id', input.organizationId)
    .eq('provider', input.provider)
    .eq('phone_number', input.callerId)
    .maybeSingle()

  if (error) {
    throw new Error(`Unable to validate the selected caller ID: ${error.message}`)
  }

  const capabilities =
    data?.capabilities && typeof data.capabilities === 'object'
      ? (data.capabilities as Record<string, unknown>)
      : {}

  if (!data || capabilities.voice === false) {
    throw new Error('The selected caller ID is not an active voice number in this workspace.')
  }
}

async function createSignalWireRelayJwt(input: {
  organizationId: string
  userId: string
}) {
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    input.organizationId,
    'signalwire',
  )
  const projectId = required(connection.credentials.projectId, 'SignalWire Project ID')
  const apiToken = required(connection.credentials.apiToken, 'SignalWire API Token')
  const spaceUrl = normalizeSpaceUrl(connection.config.space_url)
  const identity = `fx_${input.userId.replace(/-/g, '')}`

  const response = await fetch(`${spaceUrl}/api/relay/rest/jwt`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      resource: identity,
      expires_in: 3600,
    }),
    cache: 'no-store',
  })

  const text = await response.text()
  let payload: { jwt_token?: string } = {}
  try {
    payload = text ? (JSON.parse(text) as { jwt_token?: string }) : {}
  } catch {
    // Preserve provider body in the error below.
  }

  if (!response.ok || !payload.jwt_token?.trim()) {
    throw new Error(
      `Unable to create SignalWire browser JWT: ${text || `HTTP ${response.status}`}`,
    )
  }

  return {
    projectId,
    token: payload.jwt_token.trim(),
    identity,
    host: new URL(spaceUrl).host,
  }
}

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
      return NextResponse.json(
        { error: 'You do not have permission to place calls.' },
        { status: 403 },
      )
    }
    await assertEntitlement('dialer.cloud', organization.organization_id)

    const requestedProvider = request.nextUrl.searchParams.get('provider') ?? ''
    if (!isTelephonyProvider(requestedProvider)) {
      return NextResponse.json(
        { error: 'A supported provider is required.' },
        { status: 400 },
      )
    }

    const callerId = request.nextUrl.searchParams.get('callerId')?.trim() ?? ''
    if (!/^\+[1-9]\d{7,14}$/.test(callerId)) {
      return NextResponse.json(
        { error: 'Select an owned E.164 caller ID before connecting the softphone.' },
        { status: 400 },
      )
    }

    await validateSelectedCallerId({
      organizationId: organization.organization_id,
      provider: requestedProvider,
      callerId,
    })

    if (requestedProvider === 'telnyx') {
      const config = await getOrganizationTelnyxConfiguration(
        organization.organization_id,
        callerId,
      )
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

    if (requestedProvider === 'signalwire') {
      const relay = await createSignalWireRelayJwt({
        organizationId: organization.organization_id,
        userId,
      })
      return NextResponse.json({
        provider: 'signalwire',
        token: relay.token,
        projectId: relay.projectId,
        identity: relay.identity,
        host: relay.host,
        userId,
        organizationId: organization.organization_id,
        callerId,
        expiresIn: 3600,
      })
    }

    if (requestedProvider === 'plivo') {
      const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
        organization.organization_id,
        'plivo',
      )
      const username = required(
        connection.credentials.endpointUsername,
        'Plivo Endpoint Username',
      )
      const password = required(
        connection.credentials.endpointPassword,
        'Plivo Endpoint Password',
      )
      return NextResponse.json({
        provider: 'plivo',
        token: password,
        username,
        identity: username,
        userId,
        organizationId: organization.organization_id,
        callerId,
        expiresIn: 3600,
      })
    }

    const config = await getOrganizationTwilioConfiguration(
      organization.organization_id,
      callerId,
    )
    const identity = `cf_${userId.replace(/-/g, '')}`
    const AccessToken = twilio.jwt.AccessToken
    const token = new AccessToken(
      config.accountSid,
      config.apiKeySid,
      config.apiKeySecret,
      {
        identity,
        ttl: 3600,
      },
    )
    token.addGrant(
      new AccessToken.VoiceGrant({
        outgoingApplicationSid: config.twimlAppSid,
        incomingAllow: true,
      }),
    )

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
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to create browser calling credentials.',
      },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

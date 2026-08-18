import { Buffer } from 'node:buffer'

import { NextRequest, NextResponse } from 'next/server'

import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import {
  getPlatformManagedSignalWireConnection,
  resolvePlatformManagedCallerId,
} from '@/lib/telephony/platform-managed-calling'

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

async function createSignalWireRelayJwt(input: {
  organizationId: string
  userId: string
}) {
  const connection = await getPlatformManagedSignalWireConnection(
    input.organizationId,
  )
  const projectId = required(
    connection.credentials.projectId,
    'SignalWire Project ID',
  )
  const apiToken = required(
    connection.credentials.apiToken,
    'SignalWire API Token',
  )
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
      `Unable to create Flowtix browser calling session: ${text || `HTTP ${response.status}`}`,
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

    const requestedProvider =
      request.nextUrl.searchParams.get('provider') ?? 'signalwire'
    if (requestedProvider !== 'signalwire') {
      return NextResponse.json(
        { error: 'Flowtix cloud calling uses the platform calling service only.' },
        { status: 400 },
      )
    }

    // Caller ID is resolved server-side from Flowtix-managed infrastructure.
    // Subscribers never provide, import, or choose provider caller IDs.
    const callerId = await resolvePlatformManagedCallerId(
      organization.organization_id,
    )
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
      callerId: callerId.phoneNumber,
      expiresIn: 3600,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to create the Flowtix browser calling session.',
      },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

import { NextResponse } from 'next/server'

import {
  acquireCallOwnershipLease,
  releaseCallOwnershipLease,
  renewCallOwnershipLease,
  transferCallOwnership,
} from '@/lib/telephony/ownership/service'
import { getCurrentOrganization } from '@/lib/team'

type OwnershipRequest = {
  action?: 'acquire' | 'renew' | 'release' | 'transfer'
  callId?: string
  leaseId?: string
  leaseToken?: string
  leaseSeconds?: number
  targetUserId?: string
  expectedVersion?: number
  reason?: string
}

export async function POST(request: Request) {
  const organization = await getCurrentOrganization()
  if (!organization) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const body = (await request.json()) as OwnershipRequest
  if (body.action === 'acquire' && typeof body.callId === 'string') {
    const result = await acquireCallOwnershipLease({
      organizationId: organization.organization_id,
      callId: body.callId,
      userId: organization.user_id,
      leaseSeconds: body.leaseSeconds,
      metadata: { source: 'api' },
    })
    return NextResponse.json(result, { status: result.acquired ? 200 : 409 })
  }

  if (
    body.action === 'renew' &&
    typeof body.leaseId === 'string' &&
    typeof body.leaseToken === 'string'
  ) {
    const result = await renewCallOwnershipLease({
      organizationId: organization.organization_id,
      leaseId: body.leaseId,
      leaseToken: body.leaseToken,
      leaseSeconds: body.leaseSeconds,
    })
    return NextResponse.json(result)
  }

  if (
    body.action === 'release' &&
    typeof body.leaseId === 'string' &&
    typeof body.leaseToken === 'string'
  ) {
    const released = await releaseCallOwnershipLease({
      organizationId: organization.organization_id,
      leaseId: body.leaseId,
      leaseToken: body.leaseToken,
      reason: body.reason,
    })
    return NextResponse.json({ released }, { status: released ? 200 : 409 })
  }

  if (
    body.action === 'transfer' &&
    typeof body.callId === 'string' &&
    typeof body.targetUserId === 'string' &&
    typeof body.expectedVersion === 'number'
  ) {
    const result = await transferCallOwnership({
      organizationId: organization.organization_id,
      callId: body.callId,
      actingUserId: organization.user_id,
      targetUserId: body.targetUserId,
      expectedVersion: body.expectedVersion,
      reason: body.reason,
      metadata: { source: 'api' },
    })
    return NextResponse.json(result, { status: result.transferred ? 200 : 409 })
  }

  return NextResponse.json({ error: 'Invalid ownership request.' }, { status: 400 })
}

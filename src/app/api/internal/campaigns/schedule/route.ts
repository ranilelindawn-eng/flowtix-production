import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { scheduleCampaignMembers } from '@/lib/campaigns/engine'

function isAuthorized(request: Request): boolean {
  const expected = process.env.INTERNAL_JOB_WORKER_SECRET?.trim()
  const authorization = request.headers.get('authorization')?.trim()

  if (!expected || !authorization?.startsWith('Bearer ')) {
    return false
  }

  const provided = authorization.slice('Bearer '.length).trim()
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  )
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized.' },
      { status: 401 },
    )
  }

  let body: Record<string, unknown> = {}

  if (request.method === 'POST') {
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      body = {}
    }
  }

  const campaignId =
    typeof body.campaignId === 'string'
      ? body.campaignId
      : new URL(request.url).searchParams.get('campaignId')
  const limit = Number(
    body.limit ?? new URL(request.url).searchParams.get('limit') ?? 25,
  )
  const leaseSeconds = Number(
    body.leaseSeconds ??
      new URL(request.url).searchParams.get('leaseSeconds') ??
      900,
  )

  try {
    const result = await scheduleCampaignMembers({
      campaignId,
      limit: Number.isFinite(limit) ? limit : 25,
      leaseSeconds: Number.isFinite(leaseSeconds)
        ? leaseSeconds
        : 900,
    })

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to schedule campaign members.',
      },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}

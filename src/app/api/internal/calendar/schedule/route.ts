import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { schedulePendingCalendarSync } from '@/lib/calendar/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request: NextRequest) {
  const expected =
    process.env.INTERNAL_JOB_WORKER_SECRET?.trim()
  const provided = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim()

  if (!expected || !provided) {
    return false
  }

  const expectedValue = Buffer.from(expected)
  const providedValue = Buffer.from(provided)

  return (
    expectedValue.length === providedValue.length &&
    timingSafeEqual(expectedValue, providedValue)
  )
}

async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized.' },
      { status: 401 },
    )
  }

  let limit = 100

  if (request.method === 'POST') {
    const body = await request
      .json()
      .catch(() => ({})) as { limit?: unknown }

    if (
      typeof body.limit === 'number' &&
      Number.isInteger(body.limit)
    ) {
      limit = body.limit
    }
  }

  const result = await schedulePendingCalendarSync(limit)

  return NextResponse.json({
    ok: true,
    ...result,
  })
}

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}

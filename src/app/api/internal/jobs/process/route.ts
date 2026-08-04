import { randomUUID, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'

import { processJobs } from '@/lib/jobs/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function isAuthorized(request: Request) {
  const expected = process.env.INTERNAL_JOB_WORKER_SECRET?.trim()

  if (!expected) {
    throw new Error(
      'Missing INTERNAL_JOB_WORKER_SECRET environment variable.',
    )
  }

  const authorization = request.headers.get('authorization')
  const bearer = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''

  const vercelCronSecret = request.headers
    .get('x-vercel-cron-signature')
    ?.trim()

  const supplied = bearer || vercelCronSecret || ''

  return Boolean(supplied) && secureEqual(supplied, expected)
}

function parseQueues(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }

  const queues = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)

  return queues.length > 0 ? queues : undefined
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: 'Unauthorized worker request.' },
        { status: 401 },
      )
    }

    const body = (await request.json().catch(() => ({}))) as {
      workerId?: unknown
      queues?: unknown
      limit?: unknown
      leaseSeconds?: unknown
    }

    const workerId =
      typeof body.workerId === 'string' && body.workerId.trim()
        ? body.workerId.trim().slice(0, 200)
        : `vercel-${randomUUID()}`

    const limit =
      typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? body.limit
        : 10

    const leaseSeconds =
      typeof body.leaseSeconds === 'number' &&
      Number.isFinite(body.leaseSeconds)
        ? body.leaseSeconds
        : 120

    const result = await processJobs({
      workerId,
      queues: parseQueues(body.queues),
      limit,
      leaseSeconds,
    })

    return NextResponse.json({
      ok: true,
      workerId,
      processedAt: new Date().toISOString(),
      ...result,
    })
  } catch (error) {
    console.error('Background job worker failed.', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Background job worker failed.',
      },
      { status: 500 },
    )
  }
}

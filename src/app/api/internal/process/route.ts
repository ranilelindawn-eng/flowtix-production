import { randomUUID, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

import { processJobs } from '@/lib/jobs/worker'

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
  const supplied = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''

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

async function readOptions(request: Request) {
  if (request.method === 'GET') {
    const url = new URL(request.url)
    const queues = url.searchParams
      .getAll('queue')
      .map((queue) => queue.trim())
      .filter(Boolean)

    return {
      workerId: url.searchParams.get('workerId') ?? undefined,
      queues: queues.length > 0 ? queues : undefined,
      limit: Number(url.searchParams.get('limit') ?? 10),
      leaseSeconds: Number(
        url.searchParams.get('leaseSeconds') ?? 120,
      ),
    }
  }

  const body = (await request.json().catch(() => ({}))) as {
    workerId?: unknown
    queues?: unknown
    limit?: unknown
    leaseSeconds?: unknown
  }

  return {
    workerId:
      typeof body.workerId === 'string' ? body.workerId : undefined,
    queues: parseQueues(body.queues),
    limit:
      typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? body.limit
        : 10,
    leaseSeconds:
      typeof body.leaseSeconds === 'number' &&
      Number.isFinite(body.leaseSeconds)
        ? body.leaseSeconds
        : 120,
  }
}

async function handleProcess(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: 'Unauthorized worker request.' },
        { status: 401 },
      )
    }

    const options = await readOptions(request)
    const workerId = options.workerId?.trim()
      ? options.workerId.trim().slice(0, 200)
      : `vercel-${randomUUID()}`

    const result = await processJobs({
      workerId,
      queues: options.queues,
      limit: Number.isFinite(options.limit) ? options.limit : 10,
      leaseSeconds: Number.isFinite(options.leaseSeconds)
        ? options.leaseSeconds
        : 120,
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

export async function GET(request: Request) {
  return handleProcess(request)
}

export async function POST(request: Request) {
  return handleProcess(request)
}

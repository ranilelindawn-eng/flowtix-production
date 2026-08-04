import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

import { scheduleDueSequenceEnrollments } from '@/lib/sequences/engine'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAuthorized(request: Request) {
  const expected = process.env.INTERNAL_JOB_WORKER_SECRET?.trim()
  const authorization = request.headers.get('authorization') ?? ''
  const supplied = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : ''

  if (!expected || !supplied) return false
  const left = Buffer.from(expected)
  const right = Buffer.from(supplied)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  let limit = 50
  if (request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { limit?: unknown }
    if (typeof body.limit === 'number') limit = body.limit
  } else {
    const raw = new URL(request.url).searchParams.get('limit')
    if (raw) limit = Number(raw)
  }

  const normalizedLimit = Math.max(
    1,
    Math.min(Number.isFinite(limit) ? limit : 50, 250),
  )
  const result = await scheduleDueSequenceEnrollments(normalizedLimit)
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}

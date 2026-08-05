import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

function createWorkerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase service-role configuration for maintenance.',
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function handleMaintenance(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: 'Unauthorized maintenance request.' },
        { status: 401 },
      )
    }

    const client = createWorkerClient()
    const { data, error } = await client.rpc(
      'recover_stale_background_jobs',
    )

    if (error) {
      throw new Error(
        `Unable to recover stale background jobs: ${error.message}`,
      )
    }

    const result = Array.isArray(data) ? data[0] ?? null : data
    const [{ data: expiredLeases, error: leaseError }, { data: expiredReservations, error: reservationError }] = await Promise.all([
      client.rpc('expire_call_ownership_leases', { target_organization: null, target_call: null }),
      client.rpc('expire_call_queue_reservations', { target_organization: null, batch_size: 100 }),
    ])
    if (leaseError) throw new Error(`Unable to expire ownership leases: ${leaseError.message}`)
    if (reservationError) throw new Error(`Unable to expire queue reservations: ${reservationError.message}`)

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      expiredOwnershipLeases: Number(expiredLeases ?? 0),
      expiredQueueReservations: Number(expiredReservations ?? 0),
      recovered:
        result && typeof result.recovered === 'number'
          ? result.recovered
          : Number(result?.recovered ?? 0),
      deadLettered:
        result && typeof result.dead_lettered === 'number'
          ? result.dead_lettered
          : Number(result?.dead_lettered ?? 0),
    })
  } catch (error) {
    console.error('Background job maintenance failed.', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Background job maintenance failed.',
      },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return handleMaintenance(request)
}

export async function POST(request: Request) {
  return handleMaintenance(request)
}

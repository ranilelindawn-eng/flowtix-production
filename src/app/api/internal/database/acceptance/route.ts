import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type RpcError = {
  message: string
}

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

function createAcceptanceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase service-role configuration for database acceptance.',
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function failureMessage(
  label: string,
  error: RpcError | null,
) {
  return `${label}: ${error?.message ?? 'Unknown database error.'}`
}

async function handleAcceptance(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: 'Unauthorized database acceptance request.' },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
          },
        },
      )
    }

    const client = createAcceptanceClient()

    const [
      schemaResult,
      rlsResult,
      constraintPlanResult,
    ] = await Promise.all([
      client.rpc('database_schema_acceptance_report'),
      client.rpc('database_rls_integrity_report'),
      client.rpc('database_constraint_validation_plan'),
    ])

    if (schemaResult.error) {
      throw new Error(
        failureMessage(
          'Unable to generate database schema acceptance report',
          schemaResult.error,
        ),
      )
    }

    if (rlsResult.error) {
      throw new Error(
        failureMessage(
          'Unable to generate RLS integrity report',
          rlsResult.error,
        ),
      )
    }

    if (constraintPlanResult.error) {
      throw new Error(
        failureMessage(
          'Unable to generate constraint validation plan',
          constraintPlanResult.error,
        ),
      )
    }

    const schema = schemaResult.data as {
      healthy?: boolean
    } | null

    const rls = rlsResult.data as {
      healthy?: boolean
    } | null

    const validationPlan = Array.isArray(
      constraintPlanResult.data,
    )
      ? constraintPlanResult.data
      : []

    return NextResponse.json(
      {
        ok:
          schema?.healthy === true &&
          rls?.healthy === true &&
          validationPlan.length === 0,
        checkedAt: new Date().toISOString(),
        schema,
        rls,
        pendingConstraintValidations: validationPlan,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    )
  } catch (error) {
    console.error('Database acceptance validation failed.', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Database acceptance validation failed.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    )
  }
}

export async function GET(request: Request) {
  return handleAcceptance(request)
}

export async function POST(request: Request) {
  return handleAcceptance(request)
}

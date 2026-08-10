import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processJobs } from '@/lib/jobs/worker'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function createServiceClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service role configuration.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function GET(request: Request) {
  const startedAt = Date.now()

  const expected =
    process.env.INTERNAL_JOB_WORKER_SECRET?.trim()

  
  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Missing INTERNAL_JOB_WORKER_SECRET.',
      },
      {
        status: 500,
      },
    )
  }

  const authorization =
    request.headers.get('authorization')

  const supplied =
    authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : ''

  if (supplied !== expected) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized worker request.',
      },
      {
        status: 401,
      },
    )
  }

  const supabase = createServiceClient()

  const { data: logRow, error: logError } =
    await supabase
      .from('worker_execution_logs')
      .insert({
        worker_id: 'vercel-cron',
        status: 'running',
      })
      .select('id')
      .single()

  if (logError) {
    console.error(
      'Unable to create worker log.',
      logError,
    )
  }

  try {
    const result = await processJobs({
      workerId: 'vercel-cron',
      queues: [
        'communications',
        'default',
        'post_call',
        'sequences',
        'campaigns',
        'telephony',
        'ai',
      ],
      limit: 25,
      leaseSeconds: 300,
    })

    const duration =
      Date.now() - startedAt

    if (logRow?.id) {
      await supabase
        .from('worker_execution_logs')
        .update({
          completed_at: new Date().toISOString(),
          claimed_jobs: result.claimed,
          completed_jobs: result.completed,
          retried_jobs: result.retried,
          failed_jobs: result.failed,
          dead_letter_jobs:
            result.deadLettered,
          duration_ms: duration,
          status: 'completed',
        })
        .eq('id', logRow.id)
    }

    return NextResponse.json({
      ok: true,
      workerId: 'vercel-cron',
      processedAt:
        new Date().toISOString(),
      ...result,
    })
  } catch (error) {
    const duration =
      Date.now() - startedAt

    if (logRow?.id) {
      await supabase
        .from('worker_execution_logs')
        .update({
          completed_at:
            new Date().toISOString(),
          duration_ms: duration,
          status: 'failed',
          error_message:
            error instanceof Error
              ? error.message
              : 'Unknown worker error',
        })
        .eq('id', logRow.id)
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown worker error',
      },
      {
        status: 500,
      },
    )
  }
}
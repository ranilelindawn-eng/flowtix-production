import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
export const dynamic = 'force-dynamic'
export async function GET() {
  const startedAt = Date.now()
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('organizations').select('id').limit(1)
    if (error) throw error
    return NextResponse.json({ status: 'ready', database: 'reachable', latencyMs: Date.now() - startedAt, timestamp: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ status: 'not_ready', database: 'unreachable', error: error instanceof Error ? error.message : 'Readiness check failed.', timestamp: new Date().toISOString() }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

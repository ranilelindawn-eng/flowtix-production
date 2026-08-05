import { NextResponse } from 'next/server'

import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const organization = await requireOrganization()
    const supabase = await createClient()
    const [{ data: snapshot, error: snapshotError }, { data: recent, error: recentError }] = await Promise.all([
      supabase.rpc('ai_usage_snapshot', { target_org: organization.organization_id }),
      supabase.from('ai_usage_reservations').select('*').eq('organization_id', organization.organization_id).order('created_at', { ascending: false }).limit(100),
    ])
    if (snapshotError) throw new Error(snapshotError.message)
    if (recentError) throw new Error(recentError.message)
    return NextResponse.json({ snapshot: Array.isArray(snapshot) ? snapshot[0] ?? null : snapshot, recent: recent ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load AI usage.' }, { status: 500 })
  }
}

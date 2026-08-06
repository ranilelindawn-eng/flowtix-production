import { NextResponse } from 'next/server'
import { getProductionReadinessOverview } from '@/lib/production'
export async function GET() {
  try { return NextResponse.json(await getProductionReadinessOverview()) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load production readiness.' }, { status: 500 }) }
}

import { NextResponse } from 'next/server'
import { collectKpiSnapshot, getKpiOverview, type KpiPeriod } from '@/lib/kpis'

function period(value: string | null): KpiPeriod {
  return value === '7d' || value === '90d' || value === '365d' ? value : '30d'
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  try {
    return NextResponse.json(await getKpiOverview(period(url.searchParams.get('period'))))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load KPIs.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { body = {} }
  const requested = typeof body === 'object' && body !== null && 'period' in body ? String(body.period) : null
  try {
    return NextResponse.json({ snapshot: await collectKpiSnapshot(period(requested)) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to collect KPIs.' }, { status: 500 })
  }
}

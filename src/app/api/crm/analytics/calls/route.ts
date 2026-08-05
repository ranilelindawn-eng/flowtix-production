import { NextResponse } from 'next/server'
import { collectCallAnalyticsSnapshot, getCallAnalyticsOverview, normalizeCallAnalyticsPeriod } from '@/lib/analytics/calls'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const period = normalizeCallAnalyticsPeriod(url.searchParams.get('period') ?? undefined)
  try {
    return NextResponse.json(await getCallAnalyticsOverview(period))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load call analytics.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { period?: string }
    const period = normalizeCallAnalyticsPeriod(body.period)
    return NextResponse.json({ snapshot: await collectCallAnalyticsSnapshot(period) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to collect call analytics.' }, { status: 500 })
  }
}

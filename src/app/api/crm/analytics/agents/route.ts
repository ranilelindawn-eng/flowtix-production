import { NextResponse } from 'next/server'
import { collectAgentAnalyticsSnapshot, getAgentAnalyticsOverview, normalizeAgentAnalyticsPeriod } from '@/lib/analytics/agents'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const period = normalizeAgentAnalyticsPeriod(url.searchParams.get('period') ?? undefined)
  try {
    return NextResponse.json(await getAgentAnalyticsOverview(period))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load agent analytics.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { period?: string }
    const period = normalizeAgentAnalyticsPeriod(body.period)
    return NextResponse.json({ snapshot: await collectAgentAnalyticsSnapshot(period) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to collect agent analytics.' }, { status: 500 })
  }
}

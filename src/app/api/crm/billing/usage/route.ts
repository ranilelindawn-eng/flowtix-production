import { NextResponse } from 'next/server'

import { calculateCurrentUsageStatement, getUsageBillingStatements } from '@/lib/billing/platform'

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

export async function GET() {
  try {
    return json({ statements: await getUsageBillingStatements() })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to load usage billing.' }, 403)
  }
}

export async function POST() {
  try {
    return json({ statementId: await calculateCurrentUsageStatement() }, 201)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to calculate usage billing.' }, 400)
  }
}

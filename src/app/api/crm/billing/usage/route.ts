import { NextResponse } from 'next/server'

import { calculateCurrentUsageStatement, getUsageBillingStatements } from '@/lib/billing/platform'

export async function GET() {
  try {
    return NextResponse.json({ statements: await getUsageBillingStatements() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load usage billing.' }, { status: 403 })
  }
}

export async function POST() {
  try {
    return NextResponse.json({ statementId: await calculateCurrentUsageStatement() }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to calculate usage billing.' }, { status: 400 })
  }
}

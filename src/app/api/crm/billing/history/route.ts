import { NextResponse } from 'next/server'

import { getBillingHistory } from '@/lib/billing/lifecycle'
import { requirePermission } from '@/lib/auth'

export async function GET() {
  try {
    await requirePermission('billing.view')
    return NextResponse.json(await getBillingHistory(), {
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load billing history.' },
      { status: 403, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
    )
  }
}

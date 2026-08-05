import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { getBillingHistory } from '@/lib/billing/lifecycle'

export async function GET() {
  await requirePermission('billing.view')
  return NextResponse.json(await getBillingHistory())
}

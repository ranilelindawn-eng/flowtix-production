import { NextResponse } from 'next/server'

import { getInvoices } from '@/lib/billing/platform'

export async function GET() {
  try {
    return NextResponse.json({ invoices: await getInvoices() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load invoices.' }, { status: 403 })
  }
}

import { NextResponse } from 'next/server'

import { getInvoices } from '@/lib/billing/platform'

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

export async function GET() {
  try {
    return json({ invoices: await getInvoices() })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to load invoices.' }, 403)
  }
}

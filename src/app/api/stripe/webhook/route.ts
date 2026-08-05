import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function retiredResponse() {
  return NextResponse.json(
    {
      error: 'Stripe billing has been retired. Flowtix uses PayMongo.',
      provider: 'paymongo',
      replacement: '/api/paymongo/checkout',
    },
    {
      status: 410,
      headers: {
        'Cache-Control': 'no-store',
        Deprecation: 'true',
        Sunset: 'Thu, 06 Aug 2026 00:00:00 GMT',
      },
    },
  )
}

export async function GET() {
  return retiredResponse()
}

export async function POST() {
  return retiredResponse()
}

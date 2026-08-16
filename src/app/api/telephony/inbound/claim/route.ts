import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error: 'Inbound calling is not supported. Flowtix is outbound-only.',
      code: 'INBOUND_CALLING_RETIRED',
    },
    { status: 410 },
  )
}

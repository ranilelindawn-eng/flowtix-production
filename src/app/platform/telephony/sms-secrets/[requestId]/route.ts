import { NextResponse } from 'next/server'

import { getPlatformSmsSenderProviderPin } from '@/lib/platform/sms-provisioning'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await params
    const pin = await getPlatformSmsSenderProviderPin(requestId)

    if (!pin) {
      return new NextResponse('No provider account PIN is stored for this request.', {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    return new NextResponse(pin, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, private, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      },
    })
  } catch (error) {
    console.error('Unable to reveal hosted-messaging provider PIN:', error)
    return NextResponse.json(
      { error: 'Unable to reveal the provider account PIN.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

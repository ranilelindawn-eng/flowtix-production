import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const getSafeRedirectPath = (next: string | null) => {
  if (!next) {
    return '/dashboard'
  }

  if (!next.startsWith('/') || next.startsWith('//')) {
    return '/dashboard'
  }

  return next
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)

  const code = requestUrl.searchParams.get('code')
  const next = getSafeRedirectPath(
    requestUrl.searchParams.get('next'),
  )

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=missing-auth-code', requestUrl.origin),
    )
  }

  const supabase = await createClient()

  const { error } =
    await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('Supabase authentication callback failed:', {
      message: error.message,
      status: error.status,
      code: error.code,
      name: error.name,
    })

    return NextResponse.redirect(
      new URL('/login?error=auth-callback-failed', requestUrl.origin),
    )
  }

  return NextResponse.redirect(
    new URL(next, requestUrl.origin),
  )
}
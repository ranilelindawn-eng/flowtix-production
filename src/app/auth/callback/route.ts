import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const getSafeRedirectPath = (next: string | null) => {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase callback configuration is missing.')

    return NextResponse.redirect(
      new URL('/login?error=missing-supabase-config', requestUrl.origin),
    )
  }

  const response = NextResponse.redirect(
    new URL(next, requestUrl.origin),
  )

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )

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

  return response
}
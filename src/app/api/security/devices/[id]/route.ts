import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

async function getAuthenticatedClient() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub

  if (error || typeof userId !== 'string' || userId.length === 0) {
    return null
  }

  return supabase
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await getAuthenticatedClient()

  if (!supabase) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 },
    )
  }

  const { id } = await params
  const body = (await request.json()) as { trusted?: boolean }
  const { data, error } = await supabase.rpc('set_device_trust', {
    p_device_id: id,
    p_trusted: Boolean(body.trusted),
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ updated: Boolean(data) })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await getAuthenticatedClient()

  if (!supabase) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 },
    )
  }

  const { id } = await params
  const { data, error } = await supabase.rpc('revoke_user_device', {
    p_device_id: id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ revoked: Boolean(data) })
}

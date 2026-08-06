import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth'
import { ATTACHMENT_BUCKET } from '@/lib/attachments'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const membership = await requirePermission('contacts.view')
  const { id } = await context.params

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: 'Attachment not found.' },
      { status: 404, headers: PRIVATE_HEADERS },
    )
  }

  const supabase = await createClient()
  const { data: attachment, error } = await supabase
    .from('attachments')
    .select('id,storage_path,status,scan_status,file_name')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { error: 'Unable to verify the attachment.' },
      { status: 500, headers: PRIVATE_HEADERS },
    )
  }

  if (!attachment || attachment.status === 'deleted') {
    return NextResponse.json(
      { error: 'Attachment not found.' },
      { status: 404, headers: PRIVATE_HEADERS },
    )
  }

  const expectedPrefix = `${membership.organization_id}/`
  if (!attachment.storage_path.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: 'Attachment storage metadata is invalid.' },
      { status: 409, headers: PRIVATE_HEADERS },
    )
  }

  if (attachment.scan_status === 'blocked') {
    return NextResponse.json(
      { error: 'This attachment is blocked.' },
      { status: 423, headers: PRIVATE_HEADERS },
    )
  }

  const { data, error: signedError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.storage_path, 60, {
      download: attachment.file_name || true,
    })

  if (signedError || !data?.signedUrl) {
    return NextResponse.json(
      { error: 'Unable to create a secure download link.' },
      { status: 500, headers: PRIVATE_HEADERS },
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error: eventError } = await supabase
    .from('attachment_events')
    .insert({
      organization_id: membership.organization_id,
      attachment_id: id,
      action: 'downloaded',
      actor_user_id: user?.id ?? null,
      metadata: { scanStatus: attachment.scan_status },
    })

  if (eventError) {
    console.error('Unable to record attachment download event:', eventError)
  }

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: PRIVATE_HEADERS,
  })
}

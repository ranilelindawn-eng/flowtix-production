import { NextResponse } from 'next/server'
import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ATTACHMENT_BUCKET } from '@/lib/attachments'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const membership = await requireOrganization()
  const { id } = await context.params
  const supabase = await createClient()
  const { data: attachment, error } = await supabase.from('attachments')
    .select('id,storage_path,status,scan_status')
    .eq('id', id).eq('organization_id', membership.organization_id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!attachment || attachment.status === 'deleted') return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
  if (attachment.scan_status === 'blocked') return NextResponse.json({ error: 'This attachment is blocked.' }, { status: 423 })
  const { data, error: signedError } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(attachment.storage_path, 300, { download: true })
  if (signedError || !data?.signedUrl) return NextResponse.json({ error: signedError?.message ?? 'Unable to create download link.' }, { status: 500 })
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('attachment_events').insert({ organization_id: membership.organization_id, attachment_id: id, action: 'downloaded', actor_user_id: user?.id ?? null })
  return NextResponse.redirect(data.signedUrl)
}

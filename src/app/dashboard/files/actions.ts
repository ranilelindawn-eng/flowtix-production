'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES, checksumFile, sanitizeAttachmentName,
  type AttachmentCategory, type AttachmentEntityType,
} from '@/lib/attachments'

const allowedEntityTypes = new Set<AttachmentEntityType>(['contact','company','opportunity','campaign','comment','task','activity','calendar','call','transcript'])
const allowedCategories = new Set<AttachmentCategory>(['general','contract','proposal','invoice','recording','transcript','image','document','other'])
const value = (form: FormData, key: string) => form.get(key)?.toString().trim() ?? ''

async function context(
  permission:
    | 'contacts.create'
    | 'contacts.update'
    | 'contacts.delete',
) {
  const membership = await requirePermission(permission)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required.')
  return { membership, supabase, user }
}

export async function uploadAdvancedAttachment(formData: FormData) {
  const { membership, supabase, user } = await context('contacts.create')
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a file to upload.')
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('Maximum file size is 25 MB.')
  const entityType = value(formData, 'entity_type') as AttachmentEntityType
  const entityId = value(formData, 'entity_id')
  const category = (value(formData, 'category') || 'general') as AttachmentCategory
  const description = value(formData, 'description') || null
  if (!allowedEntityTypes.has(entityType) || !entityId) throw new Error('A valid attachment entity is required.')
  if (!allowedCategories.has(category)) throw new Error('Invalid attachment category.')

  const checksum = await checksumFile(file)
  const safeName = sanitizeAttachmentName(file.name)
  const attachmentId = crypto.randomUUID()
  const path = `${membership.organization_id}/${entityType}/${entityId}/${attachmentId}/v1-${safeName}`
  const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (uploadError) throw new Error(uploadError.message)

  const { error } = await supabase.from('attachments').insert({
    id: attachmentId, organization_id: membership.organization_id, entity_type: entityType,
    entity_id: entityId, file_name: file.name, storage_path: path,
    mime_type: file.type || null, size_bytes: file.size, uploaded_by: user.id,
    category, description, checksum_sha256: checksum,
    scan_status: 'pending', status: 'active', version_number: 1,
  })
  if (error) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path])
    throw new Error(error.message)
  }
  await supabase.from('attachment_versions').insert({
    organization_id: membership.organization_id, attachment_id: attachmentId,
    version_number: 1, file_name: file.name, storage_path: path,
    mime_type: file.type || null, size_bytes: file.size, checksum_sha256: checksum, uploaded_by: user.id,
  })
  await supabase.from('attachment_events').insert({
    organization_id: membership.organization_id, attachment_id: attachmentId,
    action: 'uploaded', actor_user_id: user.id, metadata: { entityType, entityId, category },
  })
  revalidatePath('/dashboard/files')
  revalidatePath(`/dashboard/companies/${entityId}`)
}


export async function uploadAttachmentVersion(formData: FormData) {
  const { membership, supabase } = await context('contacts.update')
  const attachmentId = value(formData, 'id')
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a replacement file.')
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('Maximum file size is 25 MB.')
  const { data: attachment, error: loadError } = await supabase.from('attachments')
    .select('id,entity_type,entity_id,version_number')
    .eq('id', attachmentId).eq('organization_id', membership.organization_id).maybeSingle()
  if (loadError) throw new Error(loadError.message)
  if (!attachment) throw new Error('Attachment not found.')
  const checksum = await checksumFile(file)
  const safeName = sanitizeAttachmentName(file.name)
  const expectedVersion = Number(attachment.version_number) + 1
  const path = `${membership.organization_id}/${attachment.entity_type}/${attachment.entity_id}/${attachment.id}/v${expectedVersion}-${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (uploadError) throw new Error(uploadError.message)
  const { error } = await supabase.rpc('register_attachment_version', {
    target_attachment_id: attachmentId,
    target_file_name: file.name,
    target_storage_path: path,
    target_mime_type: file.type || '',
    target_size_bytes: file.size,
    target_checksum_sha256: checksum,
  })
  if (error) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path])
    throw new Error(error.message)
  }
  revalidatePath('/dashboard/files')
}

export async function archiveAttachment(formData: FormData) {
  const { membership, supabase, user } = await context('contacts.update')
  const id = value(formData, 'id')
  const { error } = await supabase.from('attachments').update({ status: 'archived', archived_at: new Date().toISOString(), archived_by: user.id })
    .eq('id', id).eq('organization_id', membership.organization_id)
  if (error) throw new Error(error.message)
  await supabase.from('attachment_events').insert({ organization_id: membership.organization_id, attachment_id: id, action: 'archived', actor_user_id: user.id })
  revalidatePath('/dashboard/files')
}

export async function restoreAttachment(formData: FormData) {
  const { membership, supabase, user } = await context('contacts.update')
  const id = value(formData, 'id')
  const { error } = await supabase.from('attachments').update({ status: 'active', archived_at: null, archived_by: null })
    .eq('id', id).eq('organization_id', membership.organization_id)
  if (error) throw new Error(error.message)
  await supabase.from('attachment_events').insert({ organization_id: membership.organization_id, attachment_id: id, action: 'restored', actor_user_id: user.id })
  revalidatePath('/dashboard/files')
}

export async function deleteAttachmentPermanently(formData: FormData) {
  const { membership, supabase, user } = await context('contacts.delete')
  const id = value(formData, 'id')
  const { data: versions, error: loadError } = await supabase.from('attachment_versions').select('storage_path')
    .eq('attachment_id', id).eq('organization_id', membership.organization_id)
  if (loadError) throw new Error(loadError.message)
  const paths = (versions ?? []).map((row) => row.storage_path)
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(ATTACHMENT_BUCKET).remove(paths)
    if (storageError) throw new Error(storageError.message)
  }
  await supabase.from('attachment_events').insert({ organization_id: membership.organization_id, attachment_id: id, action: 'deleted', actor_user_id: user.id })
  const { error } = await supabase.from('attachments').delete().eq('id', id).eq('organization_id', membership.organization_id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/files')
}

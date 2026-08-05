import { createHash } from 'node:crypto'
import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Attachment, AttachmentCategory, AttachmentEntityType } from './types'

export const ATTACHMENT_BUCKET = 'crm-attachments'
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

export function sanitizeAttachmentName(name: string): string {
  const safe = name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')
  return safe.slice(0, 180) || 'attachment'
}

export async function checksumFile(file: File): Promise<string> {
  return createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex')
}

export async function listAttachments(filters: {
  status?: 'active' | 'archived'
  entityType?: AttachmentEntityType
  category?: AttachmentCategory
  search?: string
} = {}): Promise<Attachment[]> {
  const membership = await requireOrganization()
  const supabase = await createClient()
  let query = supabase.from('attachments').select('*')
    .eq('organization_id', membership.organization_id)
    .eq('status', filters.status ?? 'active')
    .order('created_at', { ascending: false })
  if (filters.entityType) query = query.eq('entity_type', filters.entityType)
  if (filters.category) query = query.eq('category', filters.category)
  if (filters.search) query = query.ilike('file_name', `%${filters.search.replace(/[%_]/g, '\\$&')}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Attachment[]
}

export async function getAttachment(id: string): Promise<Attachment | null> {
  const membership = await requireOrganization()
  const supabase = await createClient()
  const { data, error } = await supabase.from('attachments').select('*')
    .eq('id', id).eq('organization_id', membership.organization_id).maybeSingle()
  if (error) throw new Error(error.message)
  return data as Attachment | null
}

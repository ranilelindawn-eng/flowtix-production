export type AttachmentEntityType =
  | 'contact' | 'company' | 'opportunity' | 'campaign' | 'comment'
  | 'task' | 'activity' | 'calendar' | 'call' | 'transcript'

export type AttachmentCategory =
  | 'general' | 'contract' | 'proposal' | 'invoice' | 'recording'
  | 'transcript' | 'image' | 'document' | 'other'

export type AttachmentStatus = 'active' | 'archived' | 'deleted'
export type AttachmentScanStatus = 'pending' | 'clean' | 'blocked' | 'failed'

export type Attachment = {
  id: string
  organization_id: string
  entity_type: AttachmentEntityType
  entity_id: string
  file_name: string
  storage_path: string
  mime_type: string | null
  size_bytes: number
  description: string | null
  category: AttachmentCategory
  status: AttachmentStatus
  version_number: number
  checksum_sha256: string | null
  scan_status: AttachmentScanStatus
  uploaded_by: string
  created_at: string
  updated_at: string
}

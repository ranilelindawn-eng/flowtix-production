export type TagCategory = 'general' | 'lifecycle' | 'source' | 'priority' | 'campaign' | 'product' | 'region' | 'custom'
export type TagEntityType = 'contact' | 'company' | 'opportunity' | 'campaign' | 'task' | 'activity' | 'calendar' | 'call'
export type TagAssignmentSource = 'manual' | 'import' | 'automation' | 'ai' | 'system'

export type CrmTag = {
  id: string
  organization_id: string
  name: string
  slug: string
  color: string
  description: string | null
  category: TagCategory
  is_active: boolean
  created_at: string
  updated_at: string
  usage_count: number
}

export type EntityTagAssignment = {
  id: string
  organization_id: string
  tag_id: string
  entity_type: TagEntityType
  entity_id: string
  source: TagAssignmentSource
  created_at: string
}

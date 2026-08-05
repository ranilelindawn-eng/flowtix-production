import { createClient } from '@/lib/supabase/server'
import type { CrmTag, EntityTagAssignment, TagEntityType } from './types'

export async function getTags(organizationId: string, includeArchived = false): Promise<CrmTag[]> {
  const supabase = await createClient()
  let query = supabase.from('tags').select('id,organization_id,name,slug,color,description,category,is_active,created_at,updated_at').eq('organization_id', organizationId).order('category').order('name')
  if (!includeArchived) query = query.eq('is_active', true)
  const [{ data, error }, usageResult] = await Promise.all([query, supabase.rpc('tag_usage_counts', { target_organization_id: organizationId })])
  if (error) throw new Error(error.message)
  if (usageResult.error) throw new Error(usageResult.error.message)
  const counts = new Map<string, number>((usageResult.data ?? []).map((row: { tag_id: string; usage_count: number | string }) => [row.tag_id, Number(row.usage_count)]))
  return (data ?? []).map((tag) => ({ ...tag, usage_count: counts.get(tag.id) ?? 0 })) as CrmTag[]
}

export async function getEntityTags(input: { organizationId: string; entityType: TagEntityType; entityId: string }): Promise<CrmTag[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('entity_tags').select('tag:tags(id,organization_id,name,slug,color,description,category,is_active,created_at,updated_at)').eq('organization_id', input.organizationId).eq('entity_type', input.entityType).eq('entity_id', input.entityId)
  if (error) throw new Error(error.message)
  return (data ?? []).flatMap((row) => row.tag ? [{ ...(row.tag as unknown as Omit<CrmTag, 'usage_count'>), usage_count: 0 }] : [])
}

export async function getTagAssignments(input: { organizationId: string; tagId?: string; entityType?: TagEntityType; entityId?: string; limit?: number }): Promise<EntityTagAssignment[]> {
  const supabase = await createClient()
  let query = supabase.from('entity_tags').select('id,organization_id,tag_id,entity_type,entity_id,source,created_at').eq('organization_id', input.organizationId).order('created_at', { ascending: false }).limit(Math.min(input.limit ?? 100, 250))
  if (input.tagId) query = query.eq('tag_id', input.tagId)
  if (input.entityType) query = query.eq('entity_type', input.entityType)
  if (input.entityId) query = query.eq('entity_id', input.entityId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as EntityTagAssignment[]
}

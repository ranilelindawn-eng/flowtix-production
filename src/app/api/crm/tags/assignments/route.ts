import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getEntityTags, getTagAssignments, type TagAssignmentSource, type TagEntityType } from '@/lib/tags'

const entityTypes = new Set<TagEntityType>(['contact','company','opportunity','campaign','task','activity','calendar','call'])
const sources = new Set<TagAssignmentSource>(['manual','import','automation','ai','system'])

export async function GET(request: Request) {
  const organization = await requirePermission('contacts.view')
  const url = new URL(request.url)
  const entityType = url.searchParams.get('entityType') as TagEntityType | null
  const entityId = url.searchParams.get('entityId')
  const tagId = url.searchParams.get('tagId') ?? undefined
  if (entityType && !entityTypes.has(entityType)) return NextResponse.json({ error: 'Invalid entity type.' }, { status: 400 })
  if (entityType && entityId) return NextResponse.json({ tags: await getEntityTags({ organizationId: organization.organization_id, entityType, entityId }) })
  return NextResponse.json({ assignments: await getTagAssignments({ organizationId: organization.organization_id, tagId, entityType: entityType ?? undefined, entityId: entityId ?? undefined }) })
}

export async function POST(request: Request) {
  const organization = await requirePermission('contacts.update')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const body = await request.json() as { tagId?: string; entityType?: TagEntityType; entityId?: string; source?: TagAssignmentSource }
  if (!body.tagId || !body.entityType || !body.entityId || !entityTypes.has(body.entityType)) return NextResponse.json({ error: 'tagId, entityType, and entityId are required.' }, { status: 400 })
  const source = body.source && sources.has(body.source) ? body.source : 'manual'
  const { data, error } = await supabase.from('entity_tags').upsert({ organization_id: organization.organization_id, tag_id: body.tagId, entity_type: body.entityType, entity_id: body.entityId, assigned_by: user.id, source }, { onConflict: 'tag_id,entity_type,entity_id' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ assignment: data })
}

export async function DELETE(request: Request) {
  const organization = await requirePermission('contacts.update')
  const body = await request.json() as { tagId?: string; entityType?: TagEntityType; entityId?: string }
  if (!body.tagId || !body.entityType || !body.entityId || !entityTypes.has(body.entityType)) return NextResponse.json({ error: 'tagId, entityType, and entityId are required.' }, { status: 400 })
  const supabase = await createClient()
  const { error } = await supabase.from('entity_tags').delete().eq('organization_id', organization.organization_id).eq('tag_id', body.tagId).eq('entity_type', body.entityType).eq('entity_id', body.entityId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ removed: true })
}

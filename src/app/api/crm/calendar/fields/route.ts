import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

const TYPES = new Set(['text','number','date','boolean','select','multi_select'])

export async function GET() {
  await requirePermission('calendar.view')
  const membership = await getCurrentOrganization()
  if (!membership) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })
  const supabase = await createClient()
  const { data, error } = await supabase.from('calendar_field_definitions').select('*').eq('organization_id', membership.organization_id).order('position').order('label')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ fields: data ?? [] })
}

export async function POST(request: Request) {
  await requirePermission('calendar.update')
  const membership = await getCurrentOrganization()
  if (!membership) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })
  const body = await request.json() as Record<string, unknown>
  const key = String(body.key ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
  const label = String(body.label ?? '').trim()
  const type = String(body.type ?? 'text')
  if (!key || !label || !TYPES.has(type)) return NextResponse.json({ error: 'A valid key, label, and field type are required.' }, { status: 400 })
  const supabase = await createClient()
  const { data, error } = await supabase.from('calendar_field_definitions').upsert({
    organization_id: membership.organization_id,
    field_key: key,
    label,
    field_type: type,
    options: Array.isArray(body.options) ? body.options : [],
    is_required: body.isRequired === true,
    is_active: body.isActive !== false,
    position: Number.isInteger(body.position) ? Number(body.position) : 0,
  }, { onConflict: 'organization_id,field_key' }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ field: data })
}

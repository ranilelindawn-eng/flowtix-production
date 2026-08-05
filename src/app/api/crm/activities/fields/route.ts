import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const organization = await requirePermission('contacts.view')
  const supabase = await createClient()
  const { data, error } = await supabase.from('activity_field_definitions').select('*').eq('organization_id', organization.organization_id).order('position')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ fields: data ?? [] })
}

export async function POST(request: Request) {
  const organization = await requirePermission('contacts.update')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const body = await request.json() as { fieldKey?: string; label?: string; fieldType?: string; options?: unknown[]; isRequired?: boolean; position?: number }
  const { data, error } = await supabase.from('activity_field_definitions').upsert({ organization_id: organization.organization_id, field_key: body.fieldKey, label: body.label, field_type: body.fieldType, options: body.options ?? [], is_required: body.isRequired ?? false, position: body.position ?? 0, created_by: user.id }, { onConflict: 'organization_id,field_key' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ field: data })
}

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

export type ContactFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'multi_select'

export type ContactFieldDefinition = {
  id: string
  organization_id: string
  field_key: string
  label: string
  field_type: ContactFieldType
  options: unknown[]
  is_required: boolean
  is_active: boolean
  position: number
}

function normalizeFieldKey(value: string): string {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)

  if (!key) throw new Error('A field key is required.')
  return key
}

export async function listContactFieldDefinitions(): Promise<ContactFieldDefinition[]> {
  const organization = await getCurrentOrganization()
  if (!organization) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contact_field_definitions')
    .select('id,organization_id,field_key,label,field_type,options,is_required,is_active,position')
    .eq('organization_id', organization.organization_id)
    .order('position', { ascending: true })
    .order('label', { ascending: true })

  if (error) throw new Error(`Failed to load contact fields: ${error.message}`)

  return (data ?? []).map((row) => ({
    ...row,
    field_type: row.field_type as ContactFieldType,
    options: Array.isArray(row.options) ? row.options : [],
  }))
}

export async function upsertContactFieldDefinition(input: {
  id?: string
  fieldKey: string
  label: string
  fieldType: ContactFieldType
  options?: unknown[]
  isRequired?: boolean
  isActive?: boolean
  position?: number
}): Promise<ContactFieldDefinition> {
  const organization = await getCurrentOrganization()
  if (!organization) throw new Error('Unable to determine the current organization.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required.')

  const payload = {
    organization_id: organization.organization_id,
    field_key: normalizeFieldKey(input.fieldKey),
    label: input.label.trim().slice(0, 120),
    field_type: input.fieldType,
    options: input.options ?? [],
    is_required: input.isRequired ?? false,
    is_active: input.isActive ?? true,
    position: Math.max(0, Math.floor(input.position ?? 0)),
    created_by: user.id,
    updated_at: new Date().toISOString(),
  }

  if (!payload.label) throw new Error('A field label is required.')

  const result = input.id
    ? await supabase
        .from('contact_field_definitions')
        .update(payload)
        .eq('id', input.id)
        .eq('organization_id', organization.organization_id)
        .select('id,organization_id,field_key,label,field_type,options,is_required,is_active,position')
        .single()
    : await supabase
        .from('contact_field_definitions')
        .insert(payload)
        .select('id,organization_id,field_key,label,field_type,options,is_required,is_active,position')
        .single()

  const { data, error } = result

  if (error) throw new Error(`Failed to save contact field: ${error.message}`)

  return {
    ...data,
    field_type: data.field_type as ContactFieldType,
    options: Array.isArray(data.options) ? data.options : [],
  }
}

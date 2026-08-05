import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth'
import {
  listContactFieldDefinitions,
  upsertContactFieldDefinition,
  type ContactFieldType,
} from '@/lib/contact-advanced'
import { writeAuditEvent } from '@/lib/security/audit'

const FIELD_TYPES = new Set<ContactFieldType>([
  'text',
  'number',
  'date',
  'boolean',
  'select',
  'multi_select',
])

export async function GET() {
  await requirePermission('contacts.view')
  return NextResponse.json({ fields: await listContactFieldDefinitions() })
}

export async function POST(request: Request) {
  const membership = await requirePermission('contacts.update')
  const body = await request.json() as Record<string, unknown>
  const fieldType = typeof body.fieldType === 'string' && FIELD_TYPES.has(body.fieldType as ContactFieldType)
    ? body.fieldType as ContactFieldType
    : 'text'

  const field = await upsertContactFieldDefinition({
    id: typeof body.id === 'string' ? body.id : undefined,
    fieldKey: typeof body.fieldKey === 'string' ? body.fieldKey : '',
    label: typeof body.label === 'string' ? body.label : '',
    fieldType,
    options: Array.isArray(body.options) ? body.options : [],
    isRequired: body.isRequired === true,
    isActive: body.isActive !== false,
    position: typeof body.position === 'number' ? body.position : 0,
  })

  await writeAuditEvent({
    action: 'contact_field.upsert',
    resourceType: 'contact_field_definition',
    resourceId: field.id,
    organizationId: membership.organization_id,
    metadata: { fieldKey: field.field_key, fieldType: field.field_type },
  })

  return NextResponse.json({ field })
}

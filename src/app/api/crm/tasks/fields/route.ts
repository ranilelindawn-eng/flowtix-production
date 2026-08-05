import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth'
import { writeAuditEvent } from '@/lib/security/audit'
import { listTaskFieldDefinitions, upsertTaskFieldDefinition, type TaskFieldDefinition } from '@/lib/task-advanced'

const TYPES = new Set<TaskFieldDefinition['field_type']>(['text','number','date','boolean','select','multi_select'])

export async function GET() {
  await requirePermission('tasks.view')
  return NextResponse.json({ fields: await listTaskFieldDefinitions() })
}

export async function POST(request: Request) {
  const membership = await requirePermission('tasks.update')
  const body = await request.json() as Record<string, unknown>
  const rawType = typeof body.fieldType === 'string' ? body.fieldType : 'text'
  const fieldType = TYPES.has(rawType as TaskFieldDefinition['field_type']) ? rawType as TaskFieldDefinition['field_type'] : 'text'
  const field = await upsertTaskFieldDefinition({
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
    action: 'task_field.upsert',
    resourceType: 'task_field_definition',
    resourceId: field.id,
    organizationId: membership.organization_id,
    metadata: { fieldKey: field.field_key, fieldType: field.field_type },
  })
  return NextResponse.json({ field })
}

import { NextResponse } from 'next/server'
import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { generateStructuredAI } from '@/lib/ai/provider'

type TaskResult = { tasks: Array<{ title: string; description: string; priority: 'low'|'medium'|'high'; dueInDays: number }> }
export async function POST(request: Request) {
  try {
    const organization = await requireOrganization()
    const input = (await request.json()) as { context?: string; contactId?: string; callId?: string }
    if (!input.context?.trim()) return NextResponse.json({ error: 'Context is required.' }, { status: 400 })
    const result = await generateStructuredAI<TaskResult>({ system: 'Suggest concrete CRM follow-up tasks based only on supplied context.', prompt: input.context, schemaDescription: { tasks: [{ title: 'string', description: 'string', priority: 'low|medium|high', dueInDays: 'integer 0 to 30' }] } })
    const supabase = await createClient()
    const rows = result.tasks.slice(0, 8).map((task) => ({ organization_id: organization.organization_id, contact_id: input.contactId || null, call_id: input.callId || null, title: task.title, description: task.description, priority: task.priority, due_in_days: task.dueInDays }))
    const { data, error } = await supabase.from('ai_task_suggestions').insert(rows).select('*')
    if (error) throw new Error(error.message)
    return NextResponse.json({ tasks: data ?? [] })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Task generation failed.' }, { status: 500 }) }
}

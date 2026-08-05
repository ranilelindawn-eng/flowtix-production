import { NextResponse } from 'next/server'

import { requireOrganization } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { generatePromptStructured } from '@/lib/ai/prompts'
import { validateSuggestedTasks, type SuggestedTask } from '@/lib/ai/validation'
import { deriveWindowedIdempotencyKey } from '@/lib/idempotency'
import { createClient } from '@/lib/supabase/server'
import { consumeMeteredUsage, isUsageLimitError } from '@/lib/usage-limits'

type TaskResult = { tasks: SuggestedTask[] }

export async function POST(request: Request) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.tasks', organization.organization_id)
    const input = (await request.json()) as {
      context?: unknown
      contactId?: unknown
      callId?: unknown
    }

    const context = typeof input.context === 'string' ? input.context.trim() : ''
    const contactId =
      typeof input.contactId === 'string' && input.contactId.trim() ? input.contactId.trim() : null
    const callId = typeof input.callId === 'string' && input.callId.trim() ? input.callId.trim() : null

    if (!context) {
      return NextResponse.json({ error: 'Context is required.' }, { status: 400 })
    }

    if (context.length > 30_000) {
      return NextResponse.json(
        { error: 'Context must be 30,000 characters or fewer.' },
        { status: 400 },
      )
    }

    await consumeMeteredUsage(
      'ai_requests',
      1,
      organization.organization_id,
      deriveWindowedIdempotencyKey('ai.tasks', { context, contactId, callId }, 120),
    )

    const generated = await generatePromptStructured<TaskResult>({
      promptKey: 'tasks.suggest',
      variables: { context },
    })
    const tasks = validateSuggestedTasks(generated.value)

    if (tasks.length === 0) {
      return NextResponse.json({ error: 'The AI did not return any usable tasks.' }, { status: 422 })
    }

    const supabase = await createClient()
    const rows = tasks.map((task) => ({
      organization_id: organization.organization_id,
      contact_id: contactId,
      call_id: callId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      due_in_days: task.dueInDays,
    }))
    const { data, error } = await supabase.from('ai_task_suggestions').insert(rows).select('*')

    if (error) throw new Error(error.message)
    return NextResponse.json({ tasks: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Task generation failed.' },
      { status: isEntitlementError(error) ? 403 : isUsageLimitError(error) ? 402 : 500 },
    )
  }
}

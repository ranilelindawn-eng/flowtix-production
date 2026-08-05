import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { generatePromptStructured } from '@/lib/ai/prompts'

import type {
  AITaskCategory,
  AITaskGenerationResult,
  AITaskPriority,
  AITaskSuggestion,
  PersistedAITaskSuggestion,
} from './types'

const MAX_CONTEXT_LENGTH = 30_000
const MAX_TASKS = 8
const PRIORITIES: readonly AITaskPriority[] = ['low', 'medium', 'high']
const CATEGORIES: readonly AITaskCategory[] = ['follow_up', 'call', 'email', 'meeting', 'research', 'internal']

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`AI task ${field} is invalid.`)
  return value.trim().slice(0, maxLength)
}

function validate(value: unknown): AITaskSuggestion[] {
  const root = record(value)
  if (!root || !Array.isArray(root.tasks)) throw new Error('The AI provider returned an invalid task list.')

  return root.tasks
    .map(record)
    .filter((item): item is Record<string, unknown> => item !== null)
    .slice(0, MAX_TASKS)
    .map((item) => {
      const priority = typeof item.priority === 'string' ? item.priority.toLowerCase() : ''
      const category = typeof item.category === 'string' ? item.category.toLowerCase() : ''
      if (!PRIORITIES.includes(priority as AITaskPriority)) throw new Error('AI task priority is invalid.')
      if (!CATEGORIES.includes(category as AITaskCategory)) throw new Error('AI task category is invalid.')
      if (typeof item.dueInDays !== 'number' || !Number.isFinite(item.dueInDays)) {
        throw new Error('AI task due date is invalid.')
      }

      return {
        title: requiredText(item.title, 'title', 250),
        description: requiredText(item.description, 'description', 2_000),
        priority: priority as AITaskPriority,
        category: category as AITaskCategory,
        dueInDays: Math.round(Math.max(0, Math.min(30, item.dueInDays))),
        rationale: requiredText(item.rationale, 'rationale', 1_000),
      }
    })
}

function generationKey(input: {
  organizationId: string
  sourceHash: string
  contactId: string | null
  callId: string | null
  transcriptId: string | null
  promptVersion: number
}): string {
  return createHash('sha256')
    .update([
      input.organizationId,
      input.sourceHash,
      input.contactId ?? '',
      input.callId ?? '',
      input.transcriptId ?? '',
      input.promptVersion,
    ].join(':'))
    .digest('hex')
}

async function assertOptionalReference(
  supabase: SupabaseClient,
  table: 'contacts' | 'calls' | 'transcripts',
  id: string | null,
  organizationId: string,
): Promise<void> {
  if (!id) return
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`The selected ${table.slice(0, -1)} is outside your organization or does not exist.`)
}

export async function generateAITaskSuggestions(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    userId: string
    context: string
    contactId?: string | null
    callId?: string | null
    transcriptId?: string | null
  },
): Promise<{ tasks: PersistedAITaskSuggestion[]; reused: boolean }> {
  const context = input.context.trim()
  if (!context) throw new Error('Context is required.')
  if (context.length > MAX_CONTEXT_LENGTH) {
    throw new Error(`Context must be ${MAX_CONTEXT_LENGTH.toLocaleString()} characters or fewer.`)
  }

  const contactId = input.contactId ?? null
  const callId = input.callId ?? null
  const transcriptId = input.transcriptId ?? null
  await Promise.all([
    assertOptionalReference(supabase, 'contacts', contactId, input.organizationId),
    assertOptionalReference(supabase, 'calls', callId, input.organizationId),
    assertOptionalReference(supabase, 'transcripts', transcriptId, input.organizationId),
  ])

  const sourceHash = createHash('sha256').update(context).digest('hex')
  const promptVersion = 2
  const key = generationKey({
    organizationId: input.organizationId,
    sourceHash,
    contactId,
    callId,
    transcriptId,
    promptVersion,
  })

  const { data: existing, error: existingError } = await supabase
    .from('ai_task_suggestions')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('generation_key', key)
    .order('generation_position', { ascending: true })
  if (existingError) throw new Error(existingError.message)
  if (existing?.length) return { tasks: existing as PersistedAITaskSuggestion[], reused: true }

  const generated = await generatePromptStructured<AITaskGenerationResult>({
    promptKey: 'tasks.suggest',
    variables: { context },
  })
  const tasks = validate(generated.value)
  if (tasks.length === 0) throw new Error('The AI did not return any usable tasks.')

  const generatedAt = new Date()
  const rows = tasks.map((task, index) => ({
    organization_id: input.organizationId,
    contact_id: contactId,
    call_id: callId,
    transcript_id: transcriptId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    category: task.category,
    due_in_days: task.dueInDays,
    suggested_due_at: new Date(generatedAt.getTime() + task.dueInDays * 86_400_000).toISOString(),
    rationale: task.rationale,
    status: 'pending',
    source_hash: sourceHash,
    generation_key: key,
    generation_position: index + 1,
    provider: generated.metadata.provider,
    model: generated.metadata.model,
    prompt_key: generated.metadata.promptKey,
    prompt_version: generated.metadata.promptVersion,
    provider_request_id: generated.metadata.requestId,
    input_tokens: generated.metadata.inputTokens,
    output_tokens: generated.metadata.outputTokens,
    latency_ms: generated.metadata.latencyMs,
    metadata: { source: 'ai_task_generation' },
    created_by: input.userId,
  }))

  const { data, error } = await supabase.from('ai_task_suggestions').insert(rows).select('*')
  if (error) {
    if (error.code === '23505') {
      const { data: concurrent, error: concurrentError } = await supabase
        .from('ai_task_suggestions')
        .select('*')
        .eq('organization_id', input.organizationId)
        .eq('generation_key', key)
        .order('generation_position', { ascending: true })
      if (concurrentError) throw new Error(concurrentError.message)
      return { tasks: (concurrent ?? []) as PersistedAITaskSuggestion[], reused: true }
    }
    throw new Error(error.message)
  }

  return { tasks: (data ?? []) as PersistedAITaskSuggestion[], reused: false }
}

export async function acceptAITaskSuggestion(
  supabase: SupabaseClient,
  input: { organizationId: string; suggestionId: string; userId: string; assignedTo?: string | null },
): Promise<{ suggestionId: string; taskId: string; reused: boolean }> {
  const { data, error } = await supabase.rpc('accept_ai_task_suggestion', {
    target_organization_id: input.organizationId,
    target_suggestion_id: input.suggestionId,
    target_assigned_to: input.assignedTo ?? input.userId,
  })
  if (error) throw new Error(error.message)
  const result = Array.isArray(data) ? data[0] : data
  if (!result?.task_id) throw new Error('The AI task suggestion could not be accepted.')
  return {
    suggestionId: input.suggestionId,
    taskId: String(result.task_id),
    reused: Boolean(result.reused),
  }
}

export async function dismissAITaskSuggestion(
  supabase: SupabaseClient,
  input: { organizationId: string; suggestionId: string; userId: string },
): Promise<void> {
  const { data, error } = await supabase
    .from('ai_task_suggestions')
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString(), dismissed_by: input.userId })
    .eq('id', input.suggestionId)
    .eq('organization_id', input.organizationId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('The suggestion is not pending or is unavailable.')
}

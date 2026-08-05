import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'

export type ContactTask = {
  id: string
  title: string
  description: string | null
  due_at: string | null
  status: 'pending' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
  assigned_to: string | null
  created_by: string
  completed_at: string | null
  created_at: string
  updated_at: string
  task_type: 'follow_up' | 'call' | 'email' | 'meeting' | 'research' | 'internal' | 'other'
  source: 'manual' | 'ai' | 'sequence' | 'campaign' | 'automation' | 'import' | 'system'
  start_at: string | null
  reminder_at: string | null
  estimated_minutes: number | null
  actual_minutes: number | null
  recurrence_rule: string | null
  outcome: string | null
  blocked_reason: string | null
}


export async function getContactTasks(
  contactId: string,
): Promise<ContactTask[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('contact_tasks')
    .select(`
      id,
      title,
      description,
      due_at,
      status,
      priority,
      assigned_to,
      created_by,
      completed_at,
      created_at,
      updated_at,
      task_type,
      source,
      start_at,
      reminder_at,
      estimated_minutes,
      actual_minutes,
      recurrence_rule,
      outcome,
      blocked_reason
    `)
    .eq('contact_id', contactId)
    .order('due_at', {
      ascending: true,
      nullsFirst: false,
    })
    .order('created_at', {
      ascending: false,
    })

  if (error) {
    console.error('Contact tasks error:', error)
    return []
  }

  return (data ?? []) as ContactTask[]
}

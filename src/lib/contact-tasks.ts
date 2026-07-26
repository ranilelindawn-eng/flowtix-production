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
      updated_at
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

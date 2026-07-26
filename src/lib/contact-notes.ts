import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'

export type ContactNote = {
  id: string
  body: string
  created_at: string
  updated_at: string
  created_by: string
}

export async function getContactNotes(
  contactId: string,
): Promise<ContactNote[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('contact_notes')
    .select(`
      id,
      body,
      created_at,
      updated_at,
      created_by
    `)
    .eq('contact_id', contactId)
    .order('created_at', {
      ascending: false,
    })

  if (error) {
    console.error('Contact notes error:', error)
    return []
  }

  return (data ?? []) as ContactNote[]
}
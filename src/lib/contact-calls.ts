import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'

export type ContactCall = {
  id: string
  direction: string
  status: string
  started_at: string
  duration_seconds: number | null
}

export async function getContactCalls(
  contactId: string,
): Promise<ContactCall[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('calls')
    .select(`
      id,
      direction,
      status,
      started_at,
      duration_seconds
    `)
    .eq('contact_id', contactId)
    .order('started_at', {
      ascending: false,
    })

  if (error) {
    console.error(error)
    return []
  }

  return (data ?? []) as ContactCall[]
}
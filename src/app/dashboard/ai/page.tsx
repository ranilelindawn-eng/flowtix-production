import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import AIWorkspace, { type ConversationSummary } from './AIWorkspace'

export default async function AIPage() {
  const organization = await requireOrganization()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let conversations: ConversationSummary[] = []

  if (user) {
    const { data } = await supabase
      .from('ai_conversations')
      .select('id,title,agent_key,updated_at')
      .eq('organization_id', organization.organization_id)
      .eq('created_by', user.id)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(50)

    conversations = (data ?? []) as ConversationSummary[]
  }

  return <AIWorkspace initialConversations={conversations} />
}

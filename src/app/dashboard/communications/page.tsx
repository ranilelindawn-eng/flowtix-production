import { Mail, MessageSquareText, ShieldCheck } from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { getCommunicationInbox } from '@/lib/communications/conversations'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganizationTimezone } from '@/lib/team'
import CommunicationComposer from './CommunicationComposer'
import ConversationInbox from './ConversationInbox'
import { activateGmailInbox } from './actions'

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>
}) {
  const [{ conversation }, timeZone, membership] = await Promise.all([
    searchParams,
    getCurrentOrganizationTimezone(),
    requirePermission('communications.view'),
  ])
  const supabase = await createClient()

  const [inbox, templateResult, snippetResult] = await Promise.all([
    getCommunicationInbox({
      membership,
      selectedConversationId: conversation ?? null,
    }),
    supabase
      .from('message_templates')
      .select('id,name,channel,subject,body')
      .eq('organization_id', membership.organization_id)
      .order('name'),
    supabase
      .from('snippets')
      .select('id,name,shortcut,content')
      .eq('organization_id', membership.organization_id)
      .order('name'),
  ])

  if (templateResult.error) {
    throw new Error(`Failed to load message templates: ${templateResult.error.message}`)
  }
  if (snippetResult.error) {
    throw new Error(`Failed to load snippets: ${snippetResult.error.message}`)
  }

  const templates = (templateResult.data ?? []).map((template) => ({
    ...template,
    channel: template.channel as 'email' | 'sms',
  }))

  return (
    <div className="space-y-6 lg:relative lg:left-1/2 lg:w-[calc(100vw-280px-4rem)] lg:max-w-none lg:-translate-x-1/2">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-cyan-200">Omnichannel customer inbox</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Conversations</h1>
          <p className="mt-2 max-w-5xl text-[15px] leading-6 text-slate-300">
            Read and reply to customer email and SMS conversations from one tenant-safe workspace.
            Owners and authorized members see only the conversations permitted by their organization role and assignment.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Organization isolated
        </div>
      </header>

      {inbox.gmail.connected && inbox.gmail.watchStatus !== 'active' ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Gmail sending is connected; inbound reply sync still needs its Pub/Sub watch.</p>
              <p className="mt-1 text-xs leading-5 text-amber-200/75">
                Outbound email continues to work. Configure the Gmail Pub/Sub values from the included Communications Inbox setup guide to receive replies in real time.
              </p>
              {inbox.canManage ? (
                <form action={activateGmailInbox} className="mt-3">
                  <button className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/15">
                    Enable Gmail inbox watch
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {!inbox.gmail.connected ? (
        <section className="rounded-2xl border border-blue-400/15 bg-blue-500/5 px-4 py-3 text-sm text-blue-100">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Connect Gmail to receive and reply to email conversations.</p>
              <p className="mt-1 text-xs leading-5 text-blue-200/75">
                SMS conversations continue to use the active organization Business SMS Number and existing SignalWire inbound webhook.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {inbox.canCompose ? (
        <CommunicationComposer templates={templates} snippets={snippetResult.data ?? []} />
      ) : null}

      <ConversationInbox
        organizationId={membership.organization_id}
        membershipId={membership.membership_id}
        timeZone={timeZone}
        inbox={inbox}
      />

      <div className="flex flex-wrap gap-3 text-sm text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email through connected Gmail when available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" /> SMS through the active Business SMS Number
        </span>
      </div>
    </div>
  )
}

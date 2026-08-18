import Link from 'next/link'
import { Mail, MessageSquareText, MessagesSquare } from 'lucide-react'

import type { ConversationChannel, ConversationDirection } from '@/lib/communications/conversations'

type Preview = {
  id: string
  channel: ConversationChannel
  subject: string | null
  preview: string
  lastMessageAt: string | null
  direction: ConversationDirection | null
  status: 'open' | 'closed'
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

export default function ContactConversationsCard({
  conversations,
}: {
  conversations: Preview[]
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            <h2 className="text-base font-semibold text-white">Conversations</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">Recent Email and SMS threads with this contact.</p>
        </div>
        <Link
          href="/dashboard/communications"
          className="text-xs font-medium text-blue-300 transition hover:text-blue-200"
        >
          Open inbox
        </Link>
      </div>

      {conversations.length ? (
        <div className="mt-4 space-y-2">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/dashboard/communications?conversation=${encodeURIComponent(conversation.id)}`}
              className="block rounded-xl border border-white/[0.07] bg-[#07111F]/75 p-3 transition hover:border-blue-400/20 hover:bg-white/[0.025]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-300">
                    {conversation.channel === 'email' ? (
                      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {conversation.channel}
                    {conversation.direction ? ` · ${conversation.direction}` : ''}
                  </p>
                  <p className="mt-1 truncate text-sm text-slate-200">
                    {conversation.subject || conversation.preview || 'Conversation'}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-600">{formatDate(conversation.lastMessageAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-slate-500">
          No Email or SMS conversations yet.
        </div>
      )}
    </section>
  )
}

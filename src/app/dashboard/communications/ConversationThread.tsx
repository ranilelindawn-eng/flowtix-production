'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Archive,
  CheckCheck,
  Mail,
  MessageSquareText,
  RotateCcw,
  Send,
  UserRound,
} from 'lucide-react'

import type {
  ConversationMessage,
  ConversationSummary,
} from '@/lib/communications/conversations'
import {
  assignConversation,
  markConversationUnread,
  replyToConversation,
  setConversationStatus,
} from './actions'

function formatDate(value: string | null, timeZone: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function messageTime(message: ConversationMessage) {
  return message.receivedAt || message.sentAt || message.createdAt
}

function statusClass(status: string) {
  switch (status) {
    case 'delivered':
    case 'received':
      return 'text-emerald-300'
    case 'sent':
      return 'text-cyan-300'
    case 'failed':
    case 'cancelled':
      return 'text-red-300'
    default:
      return 'text-slate-400'
  }
}

export default function ConversationThread({
  conversation,
  messages,
  teamMembers,
  canAssign,
  canManage,
  canReply,
  timeZone,
}: {
  conversation: ConversationSummary
  messages: ConversationMessage[]
  teamMembers: Array<{ id: string; name: string; email: string | null; role: string }>
  canAssign: boolean
  canManage: boolean
  canReply: boolean
  timeZone: string
}) {
  const [replyChannel, setReplyChannel] = useState<'email' | 'sms'>(conversation.lastChannel)

  return (
    <div className="flex min-h-[720px] min-w-0 flex-col bg-[#081321]/95">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-semibold text-white">{conversation.contactName}</h2>
              {conversation.status === 'closed' ? (
                <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-medium text-slate-400">Closed</span>
              ) : null}
            </div>
            <p className="mt-1.5 truncate text-sm text-slate-300">
              {conversation.companyName ? `${conversation.companyName} · ` : ''}
              {conversation.participantAddress || 'No participant address'}
            </p>
            {conversation.subject ? (
              <p className="mt-1 truncate text-sm text-slate-300">{conversation.subject}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {conversation.contactId ? (
              <Link
                href={`/dashboard/contacts/${conversation.contactId}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                Contact
              </Link>
            ) : null}

            <form action={markConversationUnread}>
              <input type="hidden" name="conversation_id" value={conversation.id} />
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/5 hover:text-white">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Mark unread
              </button>
            </form>

            {canManage ? (
              <form action={setConversationStatus}>
                <input type="hidden" name="conversation_id" value={conversation.id} />
                <input type="hidden" name="status" value={conversation.status === 'open' ? 'closed' : 'open'} />
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/5 hover:text-white">
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  {conversation.status === 'open' ? 'Close' : 'Reopen'}
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-300">Assigned to</span>
          {canAssign ? (
            <form action={assignConversation} className="flex items-center gap-2">
              <input type="hidden" name="conversation_id" value={conversation.id} />
              <select
                name="assigned_membership_id"
                defaultValue={conversation.assignedMembershipId ?? ''}
                className="min-h-10 rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {member.role}
                  </option>
                ))}
              </select>
              <button className="rounded-lg bg-white/[0.07] px-3 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10">Save</button>
            </form>
          ) : (
            <span className="rounded-lg bg-white/[0.07] px-3 py-2 text-sm text-slate-200">
              {conversation.assignedName ?? 'Unassigned'}
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
        {messages.length ? messages.map((message) => {
          const inbound = message.direction === 'inbound'
          const inboundSender = message.sender?.trim() || null
          const label = inbound
            ? (inboundSender && inboundSender.toLowerCase() !== conversation.contactEmail?.toLowerCase()
                ? inboundSender
                : conversation.contactName)
            : (message.sentByName || 'Flowtix team')
          return (
            <article
              key={message.id}
              className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}
            >
              <div className={`max-w-[92%] rounded-2xl border px-5 py-4 sm:max-w-[82%] ${inbound ? 'border-cyan-400/20 bg-cyan-500/[0.075]' : 'border-violet-400/20 bg-violet-500/[0.085]'}`}>
                <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-100">{label}</span>
                  <span className="inline-flex items-center gap-1 uppercase tracking-wide text-slate-400">
                    {message.channel === 'email' ? <Mail className="h-3 w-3" aria-hidden="true" /> : <MessageSquareText className="h-3 w-3" aria-hidden="true" />}
                    {message.channel}
                  </span>
                  <span className="text-slate-400">{formatDate(messageTime(message), timeZone)}</span>
                </div>

                {message.subject ? (
                  <p className="mb-2 text-base font-semibold text-white">{message.subject}</p>
                ) : null}
                <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-100">{message.body}</p>

                <div className="mt-2.5 flex items-center justify-end gap-1 text-xs">
                  {!inbound ? <CheckCheck className={`h-3 w-3 ${statusClass(message.status)}`} aria-hidden="true" /> : null}
                  <span className={statusClass(message.status)}>{message.status}</span>
                </div>

                {message.errorMessage ? (
                  <p className="mt-2 rounded-lg bg-red-500/10 px-2 py-1.5 text-xs text-red-300">{message.errorMessage}</p>
                ) : null}
              </div>
            </article>
          )
        }) : (
          <div className="flex h-full min-h-52 items-center justify-center text-center text-base text-slate-400">
            No messages are recorded in this conversation yet.
          </div>
        )}
      </div>

      <footer className="border-t border-white/10 bg-[#07111F]/95 p-5">
        {conversation.status === 'closed' ? (
          <div className="rounded-xl border border-slate-400/10 bg-white/[0.025] px-4 py-3 text-sm text-slate-400">
            This conversation is closed. An owner or admin can reopen it before another reply is sent.
          </div>
        ) : canReply ? (
          <form action={replyToConversation} className="space-y-3">
            <input type="hidden" name="conversation_id" value={conversation.id} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-300">Reply via</span>
                <select
                  name="channel"
                  value={replyChannel}
                  onChange={(event) => setReplyChannel(event.target.value as 'email' | 'sms')}
                  className="min-h-10 rounded-lg border border-white/10 bg-[#0B1726] px-3 text-sm text-white outline-none focus:border-blue-500"
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <span className="text-xs text-slate-400">
                Replies use this organization&apos;s connected provider account.
              </span>
            </div>

            <textarea
              required
              name="body"
              rows={4}
              placeholder={`Reply to ${conversation.contactName} by ${replyChannel.toUpperCase()}...`}
              className="w-full rounded-xl border border-white/10 bg-[#0B1726] px-4 py-3.5 text-[15px] leading-6 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
            />

            <div className="flex justify-end">
              <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
                <Send className="h-4 w-4" aria-hidden="true" />
                Send reply
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-slate-300">
            Your role can read this conversation but does not have permission to reply.
          </div>
        )}
      </footer>
    </div>
  )
}

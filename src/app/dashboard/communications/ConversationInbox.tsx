'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Inbox,
  Mail,
  MessageSquareText,
  Search,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react'

import type { ConversationInboxData, ConversationSummary } from '@/lib/communications/conversations'
import { createClient } from '@/lib/supabase/client'
import { markConversationRead } from './actions'
import ConversationThread from './ConversationThread'

type ViewFilter = 'inbox' | 'unread' | 'mine' | 'unassigned' | 'closed'
type ChannelFilter = 'all' | 'email' | 'sms'

function formatConversationTime(value: string | null, timeZone: string) {
  if (!value) return '—'
  const date = new Date(value)
  const now = new Date()
  const sameDay = new Intl.DateTimeFormat('en-CA', { timeZone }).format(date) === new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)

  return new Intl.DateTimeFormat('en-US', sameDay
    ? { timeZone, hour: 'numeric', minute: '2-digit' }
    : { timeZone, month: 'short', day: 'numeric' }
  ).format(date)
}

function matchesSearch(conversation: ConversationSummary, search: string) {
  if (!search) return true
  const haystack = [
    conversation.contactName,
    conversation.contactEmail,
    conversation.contactPhone,
    conversation.companyName,
    conversation.participantAddress,
    conversation.subject,
    conversation.lastMessagePreview,
    conversation.assignedName,
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(search.toLowerCase())
}

export default function ConversationInbox({
  organizationId,
  membershipId,
  timeZone,
  inbox,
}: {
  organizationId: string
  membershipId: string
  timeZone: string
  inbox: ConversationInboxData
}) {
  const router = useRouter()
  const [view, setView] = useState<ViewFilter>('inbox')
  const [channel, setChannel] = useState<ChannelFilter>('all')
  const [search, setSearch] = useState('')
  const [messageSearchResult, setMessageSearchResult] = useState<{ query: string; ids: Set<string> }>({
    query: '',
    ids: new Set(),
  })
  const [, startTransition] = useTransition()

  const selected = inbox.selectedConversation
  const selectedId = selected?.id ?? null
  const selectedUnreadCount = selected?.unreadCount ?? 0
  const filteredConversations = useMemo(() => inbox.conversations.filter((conversation) => {
    if (channel !== 'all' && conversation.lastChannel !== channel && conversation.primaryChannel !== channel) return false
    const normalizedSearch = search.trim()
    const messageMatch = normalizedSearch.length >= 2
      && messageSearchResult.query === normalizedSearch
      && messageSearchResult.ids.has(conversation.id)
    if (normalizedSearch && !matchesSearch(conversation, normalizedSearch) && !messageMatch) return false

    switch (view) {
      case 'unread':
        return conversation.status === 'open' && conversation.unreadCount > 0
      case 'mine':
        return conversation.status === 'open' && conversation.assignedMembershipId === membershipId
      case 'unassigned':
        return conversation.status === 'open' && !conversation.assignedMembershipId
      case 'closed':
        return conversation.status === 'closed'
      case 'inbox':
      default:
        return conversation.status === 'open'
    }
  }), [channel, inbox.conversations, membershipId, messageSearchResult, search, view])

  useEffect(() => {
    const normalizedSearch = search.trim()
    if (normalizedSearch.length < 2 || inbox.conversations.length === 0) return

    let cancelled = false
    const timer = setTimeout(() => {
      const supabase = createClient()
      void supabase.rpc('search_communication_conversation_messages', {
        p_organization_id: organizationId,
        p_conversation_ids: inbox.conversations.map((conversation) => conversation.id),
        p_query: normalizedSearch,
      }).then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Conversation message search failed:', error.message)
          return
        }
        setMessageSearchResult({
          query: normalizedSearch,
          ids: new Set((data ?? []).map((row: { conversation_id: string | null }) => String(row.conversation_id))),
        })
      })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [inbox.conversations, organizationId, search])

  useEffect(() => {
    if (!selectedId || selectedUnreadCount <= 0) return

    startTransition(() => {
      void markConversationRead(selectedId).then(() => router.refresh())
    })
  }, [router, selectedId, selectedUnreadCount])

  useEffect(() => {
    const supabase = createClient()
    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => router.refresh(), 350)
    }

    const realtimeChannel = supabase
      .channel(`communications:${organizationId}:${membershipId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'communication_messages',
          filter: `organization_id=eq.${organizationId}`,
        },
        scheduleRefresh,
      )
      .subscribe()

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      void supabase.removeChannel(realtimeChannel)
    }
  }, [membershipId, organizationId, router])

  const openCount = inbox.conversations.filter((conversation) => conversation.status === 'open').length
  const mineCount = inbox.conversations.filter((conversation) => conversation.status === 'open' && conversation.assignedMembershipId === membershipId).length
  const unassignedCount = inbox.conversations.filter((conversation) => conversation.status === 'open' && !conversation.assignedMembershipId).length
  const closedCount = inbox.conversations.filter((conversation) => conversation.status === 'closed').length

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#07111F]/90 shadow-2xl shadow-black/10">
      <div className="grid min-h-[720px] xl:grid-cols-[230px_380px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-[#08111D]/95 p-5 xl:border-b-0 xl:border-r">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Inbox</p>
          </div>

          <nav className="space-y-1">
            {[
              { key: 'inbox' as const, label: 'Inbox', count: openCount, icon: Inbox },
              { key: 'unread' as const, label: 'Unread', count: inbox.unreadConversationCount, icon: Mail },
              { key: 'mine' as const, label: 'My Inbox', count: mineCount, icon: UserRoundCheck },
              { key: 'unassigned' as const, label: 'Unassigned', count: unassignedCount, icon: UsersRound },
              { key: 'closed' as const, label: 'Closed', count: closedCount, icon: Inbox },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setView(item.key)}
                  className={`flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-[15px] font-medium transition ${view === item.key ? 'bg-blue-500/15 text-blue-100 ring-1 ring-blue-400/20' : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'}`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </span>
                  <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-xs text-slate-300">{item.count}</span>
                </button>
              )
            })}
          </nav>

          <div className="mt-7 border-t border-white/10 pt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Channels</p>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setChannel('all')}
                className={`w-full rounded-lg px-3.5 py-2.5 text-left text-[15px] font-medium ${channel === 'all' ? 'bg-white/[0.07] text-white ring-1 ring-white/10' : 'text-slate-300 hover:bg-white/[0.035] hover:text-white'}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setChannel('email')}
                className={`flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-left text-[15px] font-medium ${channel === 'email' ? 'bg-white/[0.07] text-white ring-1 ring-white/10' : 'text-slate-300 hover:bg-white/[0.035] hover:text-white'}`}
              >
                <Mail className="h-4 w-4" aria-hidden="true" /> Email
              </button>
              <button
                type="button"
                onClick={() => setChannel('sms')}
                className={`flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-left text-[15px] font-medium ${channel === 'sms' ? 'bg-white/[0.07] text-white ring-1 ring-white/10' : 'text-slate-300 hover:bg-white/[0.035] hover:text-white'}`}
              >
                <MessageSquareText className="h-4 w-4" aria-hidden="true" /> SMS
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 border-b border-white/10 bg-[#091522]/90 xl:border-b-0 xl:border-r">
          <div className="border-b border-white/10 p-3">
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#07111F] px-3.5 py-2.5">
              <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search conversations..."
                className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-slate-500"
              />
            </label>
          </div>

          <div className="max-h-[720px] overflow-y-auto">
            {filteredConversations.length ? filteredConversations.map((conversation) => {
              const active = selected?.id === conversation.id
              return (
                <Link
                  key={conversation.id}
                  href={`/dashboard/communications?conversation=${encodeURIComponent(conversation.id)}`}
                  className={`block border-b border-white/[0.07] px-4 py-4 transition ${active ? 'bg-blue-500/[0.11]' : 'hover:bg-white/[0.035]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`truncate text-[15px] ${conversation.unreadCount > 0 ? 'font-semibold text-white' : 'font-semibold text-slate-100'}`}>
                          {conversation.contactName}
                        </p>
                        {conversation.unreadCount > 0 ? (
                          <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{conversation.unreadCount}</span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 truncate text-sm leading-5 text-slate-300">
                        {conversation.subject || conversation.lastMessagePreview || 'No message preview'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatConversationTime(conversation.lastMessageAt, timeZone)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-slate-400">
                      {conversation.lastChannel === 'email' ? <Mail className="h-3 w-3" aria-hidden="true" /> : <MessageSquareText className="h-3 w-3" aria-hidden="true" />}
                      {conversation.lastChannel}
                      {conversation.lastDirection ? ` · ${conversation.lastDirection}` : ''}
                    </span>
                    <span className="max-w-[150px] truncate text-xs text-slate-400">
                      {conversation.assignedName || 'Unassigned'}
                    </span>
                  </div>
                </Link>
              )
            }) : (
              <div className="px-5 py-12 text-center text-[15px] text-slate-400">
                No conversations match this view.
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0">
          {selected ? (
            <ConversationThread
              key={selected.id}
              conversation={selected}
              messages={inbox.messages}
              teamMembers={inbox.teamMembers}
              canAssign={inbox.canAssign}
              canManage={inbox.canManage}
              canReply={inbox.canReply}
              timeZone={timeZone}
            />
          ) : (
            <div className="flex min-h-[720px] items-center justify-center px-8 text-center text-base text-slate-400">
              Select a conversation to read and reply, or start a new message above.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

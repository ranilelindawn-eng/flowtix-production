'use client'

import {
  Archive,
  Bot,
  Copy,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { useOrganizationTimezone } from '@/components/timezone/OrganizationTimezoneProvider'
export type ConversationSummary = {
  id: string
  title: string
  agent_key: string
  updated_at: string
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

type ConversationPayload = {
  conversation?: ConversationSummary
  messages?: ChatMessage[]
  message?: ChatMessage
  error?: string
}

const agents = [
  { key: 'general', label: 'General Assistant', description: 'CRM help, writing, planning, and analysis.' },
  { key: 'sales', label: 'Sales Coach', description: 'Qualification, objections, pipeline, and next actions.' },
  { key: 'sdr', label: 'SDR Assistant', description: 'Prospecting, outreach, call scripts, and follow-ups.' },
  { key: 'support', label: 'Support Specialist', description: 'Customer replies, issue triage, and resolution plans.' },
  { key: 'marketing', label: 'Marketing Strategist', description: 'Campaigns, positioning, messaging, and conversion.' },
]

const starters = [
  'Write a concise follow-up email after a sales call.',
  'Create a cold-call script for a new B2B prospect.',
  'Give me a lead qualification checklist.',
  'Suggest the next best actions for a stalled opportunity.',
]

function formatTime(value: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
    timeZone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

export default function AIWorkspace({ initialConversations }: { initialConversations: ConversationSummary[] }) {
  const timeZone = useOrganizationTimezone()
  const [conversations, setConversations] = useState(initialConversations)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [agentKey, setAgentKey] = useState('general')
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return conversations
    return conversations.filter((conversation) => conversation.title.toLowerCase().includes(query))
  }, [conversations, search])

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null
  const selectedAgent = agents.find((agent) => agent.key === agentKey) ?? agents[0]

  function startNewChat() {
    setActiveId(null)
    setMessages([])
    setAgentKey('general')
    setDraft('')
    setError('')
  }

  async function openConversation(id: string) {
    setLoadingConversation(true)
    setError('')
    try {
      const response = await fetch(`/api/ai/conversations/${id}`, { cache: 'no-store' })
      const payload = (await response.json()) as ConversationPayload
      if (!response.ok) throw new Error(payload.error || 'Unable to load conversation.')
      setActiveId(id)
      setMessages(payload.messages ?? [])
      setAgentKey(payload.conversation?.agent_key ?? 'general')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load conversation.')
    } finally {
      setLoadingConversation(false)
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault()
    const message = draft.trim()
    if (!message || sending) return

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    }

    setDraft('')
    setError('')
    setSending(true)
    setMessages((current) => [...current, optimistic])

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, message, agentKey }),
      })
      const payload = (await response.json()) as ConversationPayload
      if (!response.ok) throw new Error(payload.error || 'AI request failed.')
      if (!payload.conversation || !payload.message) throw new Error('AI returned an incomplete response.')

      setActiveId(payload.conversation.id)
      setMessages((current) => [...current, payload.message as ChatMessage])
      setConversations((current) => {
        const next = current.filter((item) => item.id !== payload.conversation?.id)
        return [payload.conversation as ConversationSummary, ...next]
      })
    } catch (caught) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id))
      setDraft(message)
      setError(caught instanceof Error ? caught.message : 'AI request failed.')
    } finally {
      setSending(false)
    }
  }

  async function deleteConversation() {
    if (!activeId || !window.confirm('Delete this AI conversation permanently?')) return
    const response = await fetch(`/api/ai/conversations/${activeId}`, { method: 'DELETE' })
    if (!response.ok) {
      const payload = (await response.json()) as ConversationPayload
      setError(payload.error || 'Unable to delete conversation.')
      return
    }
    setConversations((current) => current.filter((item) => item.id !== activeId))
    startNewChat()
  }

  async function archiveConversation() {
    if (!activeId) return
    const response = await fetch(`/api/ai/conversations/${activeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    })
    if (!response.ok) {
      const payload = (await response.json()) as ConversationPayload
      setError(payload.error || 'Unable to archive conversation.')
      return
    }
    setConversations((current) => current.filter((item) => item.id !== activeId))
    startNewChat()
  }

  return (
    <div className="-m-6 flex min-h-[calc(100vh-7rem)] overflow-hidden rounded-3xl border border-white/10 bg-slate-950 lg:m-0 lg:min-h-[760px]">
      <aside className="hidden w-80 shrink-0 flex-col border-r border-white/10 bg-slate-950/80 lg:flex">
        <div className="border-b border-white/10 p-4">
          <button
            type="button"
            onClick={startNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" /> New chat
          </button>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Recent chats</p>
          <div className="space-y-1">
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void openConversation(conversation.id)}
                className={`w-full rounded-xl px-3 py-3 text-left transition ${
                  conversation.id === activeId ? 'bg-blue-500/15 text-white' : 'text-slate-300 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{conversation.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatTime(conversation.updated_at, timeZone)}</p>
                  </div>
                </div>
              </button>
            ))}
            {!filteredConversations.length ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">No conversations yet.</p>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[#071321]">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-300" />
              <h1 className="text-lg font-semibold text-white">AI Workspace</h1>
            </div>
            <p className="mt-1 text-xs text-slate-500">Tenant-isolated assistant for your Flowtix workspace</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={agentKey}
              onChange={(event) => setAgentKey(event.target.value)}
              disabled={Boolean(activeConversation)}
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none disabled:opacity-60"
            >
              {agents.map((agent) => <option key={agent.key} value={agent.key}>{agent.label}</option>)}
            </select>
            {activeId ? (
              <>
                <button type="button" onClick={() => void archiveConversation()} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" title="Archive">
                  <Archive className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => void deleteConversation()} className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-300" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : <MoreHorizontal className="h-5 w-5 text-slate-600" />}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          {error ? (
            <div className="mx-auto mb-5 max-w-3xl rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
          ) : null}

          {loadingConversation ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-400" /></div>
          ) : messages.length ? (
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((message) => (
                <article key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role === 'assistant' ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><Bot className="h-5 w-5" /></div>
                  ) : null}
                  <div className={`group max-w-[86%] rounded-2xl px-4 py-3 ${message.role === 'user' ? 'bg-blue-600 text-white' : 'border border-white/10 bg-white/[0.04] text-slate-200'}`}>
                    <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                    {message.role === 'assistant' ? (
                      <button type="button" onClick={() => void navigator.clipboard.writeText(message.content)} className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 opacity-0 transition group-hover:opacity-100">
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                    ) : null}
                  </div>
                  {message.role === 'user' ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300"><UserRound className="h-5 w-5" /></div>
                  ) : null}
                </article>
              ))}
              {sending ? (
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><Bot className="h-5 w-5" /></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-xl shadow-blue-950/50">
                <Sparkles className="h-8 w-8" />
              </div>
              <h2 className="mt-6 text-3xl font-bold text-white">How can Flowtix AI help?</h2>
              <p className="mt-3 max-w-xl leading-7 text-slate-400">Use the {selectedAgent.label} for CRM planning, outreach, call preparation, and practical next actions.</p>
              <p className="mt-1 text-sm text-slate-500">{selectedAgent.description}</p>
              <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                {starters.map((starter) => (
                  <button key={starter} type="button" onClick={() => setDraft(starter)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm leading-6 text-slate-300 transition hover:border-blue-400/40 hover:bg-blue-500/5">
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-4 sm:px-8">
          <form onSubmit={(event) => void sendMessage(event)} className="mx-auto max-w-3xl">
            <div className="flex items-end gap-3 rounded-2xl border border-white/10 bg-slate-950 p-3 focus-within:border-blue-500">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void sendMessage()
                  }
                }}
                rows={1}
                maxLength={20_000}
                placeholder="Ask Flowtix AI anything…"
                className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <button type="submit" disabled={!draft.trim() || sending} className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-slate-600">AI can make mistakes. Verify important customer, legal, billing, and compliance information.</p>
          </form>
        </div>
      </section>
    </div>
  )
}

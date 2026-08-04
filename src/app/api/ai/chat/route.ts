import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'

import { requireOrganization } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { generateTextAI, getAIProviderLabel } from '@/lib/ai/provider'
import { createClient } from '@/lib/supabase/server'
import { consumeMeteredUsage, isUsageLimitError } from '@/lib/usage-limits'

const MAX_MESSAGE_LENGTH = 20_000
const AGENT_PROMPTS: Record<string, string> = {
  general: 'You are Flowtix AI, a concise and practical CRM assistant.',
  sales: 'You are a senior sales coach. Focus on pipeline progress, qualification, objections, and next actions.',
  sdr: 'You are an expert SDR. Help with prospecting, outreach, cold-call scripts, and follow-up sequences.',
  support: 'You are a customer support specialist. Be empathetic, accurate, and action-oriented.',
  marketing: 'You are a B2B marketing strategist. Focus on campaigns, positioning, messaging, and conversion.',
}

type ConversationRow = {
  id: string
  title: string
  agent_key: string
  updated_at: string
}

type MessageRow = {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: Request) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.chat', organization.organization_id)
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

    const body = (await request.json()) as {
      conversationId?: unknown
      message?: unknown
      agentKey?: unknown
    }
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const requestedAgent = typeof body.agentKey === 'string' ? body.agentKey.trim() : 'general'
    const agentKey = AGENT_PROMPTS[requestedAgent] ? requestedAgent : 'general'

    if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: `Message must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer.` }, { status: 400 })
    }

    await consumeMeteredUsage(
      'ai_requests',
      1,
      organization.organization_id,
      randomUUID(),
    )

    let conversation: ConversationRow | null = null
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : ''

    if (conversationId) {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('id,title,agent_key,updated_at')
        .eq('id', conversationId)
        .eq('organization_id', organization.organization_id)
        .eq('created_by', user.id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      conversation = data as ConversationRow | null
    }

    if (!conversation) {
      const title = message.length > 52 ? `${message.slice(0, 52)}…` : message
      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({
          organization_id: organization.organization_id,
          created_by: user.id,
          title,
          agent_key: agentKey,
        })
        .select('id,title,agent_key,updated_at')
        .single()
      if (error) throw new Error(error.message)
      conversation = data as ConversationRow
    }

    const { error: userMessageError } = await supabase.from('ai_messages').insert({
      conversation_id: conversation.id,
      organization_id: organization.organization_id,
      created_by: user.id,
      role: 'user',
      content: message,
    })
    if (userMessageError) throw new Error(userMessageError.message)

    const [{ count: contactCount }, { count: companyCount }, { count: callCount }, { data: history, error: historyError }] = await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', organization.organization_id),
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('organization_id', organization.organization_id),
      supabase.from('calls').select('id', { count: 'exact', head: true }).eq('organization_id', organization.organization_id),
      supabase
        .from('ai_messages')
        .select('role,content')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    if (historyError) throw new Error(historyError.message)

    const chronological = ((history ?? []) as MessageRow[]).reverse()
    const system = `${AGENT_PROMPTS[conversation.agent_key] ?? AGENT_PROMPTS.general}
You are operating inside one tenant-isolated Flowtix workspace.
Known CRM totals: ${contactCount ?? 0} contacts, ${companyCount ?? 0} companies, ${callCount ?? 0} calls.
Do not claim access to records you have not been given. When data is insufficient, say what is missing. Never invent customer details.`

    const reply = await generateTextAI({ system, messages: chronological })
    const model = getAIProviderLabel()

    const { data: assistantMessage, error: assistantMessageError } = await supabase
      .from('ai_messages')
      .insert({
        conversation_id: conversation.id,
        organization_id: organization.organization_id,
        created_by: user.id,
        role: 'assistant',
        content: reply,
        provider: 'openai-compatible',
        model,
      })
      .select('id,role,content,created_at')
      .single()
    if (assistantMessageError) throw new Error(assistantMessageError.message)

    await supabase
      .from('ai_conversations')
      .update({ updated_at: new Date().toISOString(), agent_key: conversation.agent_key })
      .eq('id', conversation.id)

    return NextResponse.json({ conversation, message: assistantMessage })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI chat failed.' },
      { status: isEntitlementError(error) ? 403 : isUsageLimitError(error) ? 402 : 500 },
    )
  }
}

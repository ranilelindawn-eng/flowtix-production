import { NextResponse } from 'next/server'

import { customerAIErrorMessage } from '@/lib/ai/errors'

import { requireOrganization } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { buildConversationContext } from '@/lib/ai/memory/service'
import { generatePromptText, type AIPromptKey } from '@/lib/ai/prompts'
import { deriveWindowedIdempotencyKey } from '@/lib/idempotency'
import { createClient } from '@/lib/supabase/server'
import { isAIUsageControlError } from '@/lib/ai/usage/service'

const MAX_MESSAGE_LENGTH = 20_000
const AGENT_PROMPT_KEYS: Record<string, AIPromptKey> = {
  general: 'chat.general',
  sales: 'chat.sales',
  sdr: 'chat.sdr',
  support: 'chat.support',
  marketing: 'chat.marketing',
}

type ConversationRow = {
  id: string
  title: string
  agent_key: string
  updated_at: string
}

export async function POST(request: Request) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.chat', organization.organization_id)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

    const body = (await request.json()) as {
      conversationId?: unknown
      message?: unknown
      agentKey?: unknown
    }
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const requestedAgent = typeof body.agentKey === 'string' ? body.agentKey.trim() : 'general'
    const agentKey = AGENT_PROMPT_KEYS[requestedAgent] ? requestedAgent : 'general'

    if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: `Message must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer.` }, { status: 400 })
    }

    const usageKey = deriveWindowedIdempotencyKey('ai.chat', { conversationId: body.conversationId, message, agentKey }, 120)

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
      metadata: { source: 'chat_api' },
    })
    if (userMessageError) throw new Error(userMessageError.message)

    const [{ count: contactCount }, { count: companyCount }, { count: callCount }, context] = await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', organization.organization_id),
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('organization_id', organization.organization_id),
      supabase.from('calls').select('id', { count: 'exact', head: true }).eq('organization_id', organization.organization_id),
      buildConversationContext(supabase, {
        conversationId: conversation.id,
        organizationId: organization.organization_id,
        userId: user.id,
      }),
    ])

    const generated = await generatePromptText({
      promptKey: AGENT_PROMPT_KEYS[conversation.agent_key] ?? 'chat.general',
      usage: {
        supabase,
        organizationId: organization.organization_id,
        feature: 'chat',
        idempotencyKey: usageKey,
        metadata: {
          conversationId: conversation.id,
          agentKey: conversation.agent_key,
        },
      },
      variables: {
        contactCount: contactCount ?? 0,
        companyCount: companyCount ?? 0,
        callCount: callCount ?? 0,
        memoryContext: context.memoryContext,
      },
      messages: context.messages,
    })

    const { data: assistantMessage, error: assistantMessageError } = await supabase
      .from('ai_messages')
      .insert({
        conversation_id: conversation.id,
        organization_id: organization.organization_id,
        created_by: user.id,
        role: 'assistant',
        content: generated.content,
        provider: generated.metadata.provider,
        model: generated.metadata.model,
        prompt_key: generated.metadata.promptKey,
        prompt_version: generated.metadata.promptVersion,
        provider_request_id: generated.metadata.requestId,
        input_tokens: generated.metadata.inputTokens,
        output_tokens: generated.metadata.outputTokens,
        latency_ms: generated.metadata.latencyMs,
        metadata: {
          includedMessageCount: context.includedMessageCount,
          includedMemoryCount: context.includedMemoryCount,
          estimatedContextTokens: context.estimatedTokens,
          contextLastSequence: context.lastSequence,
        },
      })
      .select('id,role,content,created_at')
      .single()
    if (assistantMessageError) throw new Error(assistantMessageError.message)

    const updatedAt = new Date().toISOString()
    await supabase
      .from('ai_conversations')
      .update({ updated_at: updatedAt, agent_key: conversation.agent_key })
      .eq('id', conversation.id)

    return NextResponse.json({
      conversation: { ...conversation, updated_at: updatedAt },
      message: assistantMessage,
      context: {
        includedMessageCount: context.includedMessageCount,
        includedMemoryCount: context.includedMemoryCount,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: customerAIErrorMessage(error, 'Flowtix AI could not complete your request. Please try again.') },
      { status: isEntitlementError(error) ? 403 : isAIUsageControlError(error) ? 402 : 500 },
    )
  }
}

import { NextResponse } from 'next/server'

import { requireOrganization } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import {
  isAIConversationMemoryType,
  listConversationMemories,
  requireOwnedAIConversation,
} from '@/lib/ai/memory/service'
import { createClient } from '@/lib/supabase/server'

const MAX_KEY_LENGTH = 80
const MAX_VALUE_LENGTH = 4_000

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.chat', organization.organization_id)
    const { id } = await context.params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

    const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true'
    const memories = await listConversationMemories(supabase, {
      conversationId: id,
      organizationId: organization.organization_id,
      userId: user.id,
      includeInactive,
    })

    return NextResponse.json({ memories })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load conversation memory.' },
      { status: isEntitlementError(error) ? 403 : error instanceof Error && error.message === 'Conversation not found.' ? 404 : 500 },
    )
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.chat', organization.organization_id)
    const { id } = await context.params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    await requireOwnedAIConversation(supabase, { conversationId: id, organizationId: organization.organization_id, userId: user.id })

    const body = (await request.json()) as {
      key?: unknown
      value?: unknown
      type?: unknown
      importance?: unknown
      sourceMessageId?: unknown
      expiresAt?: unknown
    }
    const memoryKey = typeof body.key === 'string' ? body.key.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_') : ''
    const value = typeof body.value === 'string' ? body.value.trim() : ''
    const memoryType = typeof body.type === 'string' && isAIConversationMemoryType(body.type) ? body.type : 'context'
    const importance = typeof body.importance === 'number' && Number.isInteger(body.importance)
      ? Math.min(100, Math.max(0, body.importance))
      : 50
    const sourceMessageId = typeof body.sourceMessageId === 'string' && body.sourceMessageId ? body.sourceMessageId : null
    const expiresAt = typeof body.expiresAt === 'string' && !Number.isNaN(Date.parse(body.expiresAt)) ? new Date(body.expiresAt).toISOString() : null

    if (!memoryKey || memoryKey.length > MAX_KEY_LENGTH) {
      return NextResponse.json({ error: `Memory key must be between 1 and ${MAX_KEY_LENGTH} characters.` }, { status: 400 })
    }
    if (!value || value.length > MAX_VALUE_LENGTH) {
      return NextResponse.json({ error: `Memory value must be between 1 and ${MAX_VALUE_LENGTH.toLocaleString()} characters.` }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('ai_conversation_memories')
      .upsert({
        conversation_id: id,
        organization_id: organization.organization_id,
        created_by: user.id,
        memory_key: memoryKey,
        memory_type: memoryType,
        value,
        importance,
        source_message_id: sourceMessageId,
        expires_at: expiresAt,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id,memory_key' })
      .select('id,conversation_id,memory_key,memory_type,value,importance,source_message_id,expires_at,created_at,updated_at')
      .single()
    if (error) throw new Error(error.message)

    return NextResponse.json({ memory: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save conversation memory.' },
      { status: isEntitlementError(error) ? 403 : error instanceof Error && error.message === 'Conversation not found.' ? 404 : 500 },
    )
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.chat', organization.organization_id)
    const { id } = await context.params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    await requireOwnedAIConversation(supabase, { conversationId: id, organizationId: organization.organization_id, userId: user.id })

    const body = (await request.json()) as { memoryId?: unknown; key?: unknown }
    const memoryId = typeof body.memoryId === 'string' ? body.memoryId : ''
    const memoryKey = typeof body.key === 'string' ? body.key.trim().toLowerCase() : ''
    if (!memoryId && !memoryKey) return NextResponse.json({ error: 'memoryId or key is required.' }, { status: 400 })

    let query = supabase
      .from('ai_conversation_memories')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('conversation_id', id)
      .eq('organization_id', organization.organization_id)
      .eq('created_by', user.id)

    query = memoryId ? query.eq('id', memoryId) : query.eq('memory_key', memoryKey)
    const { error } = await query
    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to forget conversation memory.' },
      { status: isEntitlementError(error) ? 403 : error instanceof Error && error.message === 'Conversation not found.' ? 404 : 500 },
    )
  }
}

import { NextResponse } from 'next/server'

import { requireOrganization } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { createClient } from '@/lib/supabase/server'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.chat', organization.organization_id)
    const { id } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

    const { data: conversation, error: conversationError } = await supabase
      .from('ai_conversations')
      .select('id,title,agent_key,created_at,updated_at,memory_version,memory_updated_at,context_message_limit,context_character_limit')
      .eq('id', id)
      .eq('organization_id', organization.organization_id)
      .eq('created_by', user.id)
      .maybeSingle()
    if (conversationError) throw new Error(conversationError.message)
    if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })

    const { data: messages, error: messagesError } = await supabase
      .from('ai_messages')
      .select('id,role,content,sequence_number,token_estimate,created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
    if (messagesError) throw new Error(messagesError.message)

    return NextResponse.json({ conversation, messages: messages ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load conversation.' }, { status: isEntitlementError(error) ? 403 : 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.chat', organization.organization_id)
    const { id } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

    const body = (await request.json()) as { title?: unknown; archived?: unknown }
    const updates: Record<string, string | null> = { updated_at: new Date().toISOString() }
    if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim().slice(0, 120)
    if (typeof body.archived === 'boolean') updates.archived_at = body.archived ? new Date().toISOString() : null

    const { data, error } = await supabase
      .from('ai_conversations')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organization.organization_id)
      .eq('created_by', user.id)
      .select('id,title,agent_key,updated_at')
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ conversation: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update conversation.' }, { status: isEntitlementError(error) ? 403 : 500 })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.chat', organization.organization_id)
    const { id } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

    const { error } = await supabase
      .from('ai_conversations')
      .delete()
      .eq('id', id)
      .eq('organization_id', organization.organization_id)
      .eq('created_by', user.id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete conversation.' }, { status: isEntitlementError(error) ? 403 : 500 })
  }
}

import { NextResponse } from 'next/server'

import {
  acceptAITaskSuggestion,
  dismissAITaskSuggestion,
  generateAITaskSuggestions,
} from '@/lib/ai/tasks/service'
import { requireOrganization } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { deriveWindowedIdempotencyKey } from '@/lib/idempotency'
import { createClient } from '@/lib/supabase/server'
import { consumeMeteredUsage, isUsageLimitError } from '@/lib/usage-limits'

function optionalId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function authenticatedUserId() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error) throw new Error(error.message)
  const userId = data?.claims?.sub
  if (typeof userId !== 'string' || !userId) throw new Error('Unable to verify the authenticated user.')
  return { supabase, userId }
}

export async function POST(request: Request) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.tasks', organization.organization_id)
    const input = (await request.json()) as {
      context?: unknown
      contactId?: unknown
      callId?: unknown
      transcriptId?: unknown
    }

    const context = typeof input.context === 'string' ? input.context.trim() : ''
    const contactId = optionalId(input.contactId)
    const callId = optionalId(input.callId)
    const transcriptId = optionalId(input.transcriptId)
    if (!context) return NextResponse.json({ error: 'Context is required.' }, { status: 400 })
    if (context.length > 30_000) {
      return NextResponse.json({ error: 'Context must be 30,000 characters or fewer.' }, { status: 400 })
    }

    const { supabase, userId } = await authenticatedUserId()
    await consumeMeteredUsage(
      'ai_requests',
      1,
      organization.organization_id,
      deriveWindowedIdempotencyKey(
        'ai.tasks.generate',
        { organizationId: organization.organization_id, context, contactId, callId, transcriptId },
        300,
      ),
    )

    const result = await generateAITaskSuggestions(supabase, {
      organizationId: organization.organization_id,
      userId,
      context,
      contactId,
      callId,
      transcriptId,
    })
    return NextResponse.json(result, { status: result.reused ? 200 : 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Task generation failed.' },
      { status: isEntitlementError(error) ? 403 : isUsageLimitError(error) ? 402 : 500 },
    )
  }
}

export async function GET(request: Request) {
  try {
    const organization = await requireOrganization()
    const url = new URL(request.url)
    const status = url.searchParams.get('status')?.trim()
    const contactId = url.searchParams.get('contactId')?.trim()
    const callId = url.searchParams.get('callId')?.trim()
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25))
    const { supabase } = await authenticatedUserId()

    let query = supabase
      .from('ai_task_suggestions')
      .select('*')
      .eq('organization_id', organization.organization_id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (status && ['pending', 'accepted', 'dismissed'].includes(status)) query = query.eq('status', status)
    if (contactId) query = query.eq('contact_id', contactId)
    if (callId) query = query.eq('call_id', callId)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return NextResponse.json({ tasks: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load AI task suggestions.' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const organization = await requireOrganization()
    const body = (await request.json()) as {
      action?: unknown
      suggestionId?: unknown
      assignedTo?: unknown
    }
    const action = typeof body.action === 'string' ? body.action.trim() : ''
    const suggestionId = optionalId(body.suggestionId)
    const assignedTo = optionalId(body.assignedTo)
    if (!suggestionId) return NextResponse.json({ error: 'Suggestion ID is required.' }, { status: 400 })

    const { supabase, userId } = await authenticatedUserId()
    if (action === 'accept') {
      const result = await acceptAITaskSuggestion(supabase, {
        organizationId: organization.organization_id,
        suggestionId,
        userId,
        assignedTo,
      })
      return NextResponse.json(result)
    }
    if (action === 'dismiss') {
      await dismissAITaskSuggestion(supabase, {
        organizationId: organization.organization_id,
        suggestionId,
        userId,
      })
      return NextResponse.json({ suggestionId, dismissed: true })
    }
    return NextResponse.json({ error: 'Action must be accept or dismiss.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update the AI task suggestion.' },
      { status: 500 },
    )
  }
}

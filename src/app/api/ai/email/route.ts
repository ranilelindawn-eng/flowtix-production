import { NextResponse } from 'next/server'

import { customerAIErrorMessage } from '@/lib/ai/errors'

import { generateAIEmail, updateAIEmailStatus } from '@/lib/ai/emails/service'
import { requireOrganization } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { deriveWindowedIdempotencyKey } from '@/lib/idempotency'
import { createClient } from '@/lib/supabase/server'
import { isAIUsageControlError } from '@/lib/ai/usage/service'

function optionalId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function authenticatedContext() {
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
    await assertEntitlement('ai.email', organization.organization_id)
    const input = (await request.json()) as {
      recipient?: unknown
      recipientEmail?: unknown
      purpose?: unknown
      context?: unknown
      tone?: unknown
      contactId?: unknown
      callId?: unknown
      transcriptId?: unknown
    }

    const recipient = typeof input.recipient === 'string' ? input.recipient.trim() : ''
    const recipientEmail = typeof input.recipientEmail === 'string' ? input.recipientEmail.trim() : ''
    const purpose = typeof input.purpose === 'string' ? input.purpose.trim() : ''
    const context = typeof input.context === 'string' ? input.context.trim() : ''
    const tone = typeof input.tone === 'string' ? input.tone.trim() : 'professional'
    const contactId = optionalId(input.contactId)
    const callId = optionalId(input.callId)
    const transcriptId = optionalId(input.transcriptId)

    if (!purpose) return NextResponse.json({ error: 'Email purpose is required.' }, { status: 400 })
    if (purpose.length > 1_000) return NextResponse.json({ error: 'Purpose must be 1,000 characters or fewer.' }, { status: 400 })
    if (context.length > 30_000) return NextResponse.json({ error: 'Context must be 30,000 characters or fewer.' }, { status: 400 })

    const { supabase, userId } = await authenticatedContext()
    const usageKey = deriveWindowedIdempotencyKey(
        'ai.email.generate',
        { organizationId: organization.organization_id, recipient, recipientEmail, purpose, context, tone, contactId, callId, transcriptId },
        300,
      )

    const result = await generateAIEmail(supabase, {
      organizationId: organization.organization_id,
      userId,
      usageIdempotencyKey: usageKey,
      recipient,
      recipientEmail,
      purpose,
      context,
      tone,
      contactId,
      callId,
      transcriptId,
    })
    return NextResponse.json(result, { status: result.reused ? 200 : 201 })
  } catch (error) {
    return NextResponse.json(
      { error: customerAIErrorMessage(error, 'The AI email could not be generated. Please try again.') },
      { status: isEntitlementError(error) ? 403 : isAIUsageControlError(error) ? 402 : 500 },
    )
  }
}

export async function GET(request: Request) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.email', organization.organization_id)
    const url = new URL(request.url)
    const status = url.searchParams.get('status')?.trim()
    const contactId = url.searchParams.get('contactId')?.trim()
    const callId = url.searchParams.get('callId')?.trim()
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25))
    const { supabase } = await authenticatedContext()

    let query = supabase
      .from('ai_generated_emails')
      .select('*')
      .eq('organization_id', organization.organization_id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (status && ['generated', 'approved', 'dismissed'].includes(status)) query = query.eq('status', status)
    if (contactId) query = query.eq('contact_id', contactId)
    if (callId) query = query.eq('call_id', callId)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return NextResponse.json({ emails: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load AI-generated emails.' },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.email', organization.organization_id)
    const body = (await request.json()) as { action?: unknown; emailId?: unknown }
    const action = typeof body.action === 'string' ? body.action.trim() : ''
    const emailId = optionalId(body.emailId)
    if (!emailId) return NextResponse.json({ error: 'Email ID is required.' }, { status: 400 })
    if (action !== 'approve' && action !== 'dismiss') {
      return NextResponse.json({ error: 'Action must be approve or dismiss.' }, { status: 400 })
    }

    const { supabase, userId } = await authenticatedContext()
    const email = await updateAIEmailStatus(supabase, {
      organizationId: organization.organization_id,
      emailId,
      userId,
      action,
    })
    return NextResponse.json({ email })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update the AI-generated email.' },
      { status: isEntitlementError(error) ? 403 : 500 },
    )
  }
}

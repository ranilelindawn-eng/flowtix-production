import { NextResponse } from 'next/server'

import { requireOrganization } from '@/lib/auth'
import { generateStructuredAI } from '@/lib/ai/provider'
import { validateGeneratedEmail, type GeneratedEmail } from '@/lib/ai/validation'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_TONES = new Set(['professional', 'friendly', 'concise', 'persuasive'])

export async function POST(request: Request) {
  try {
    const organization = await requireOrganization()
    const input = (await request.json()) as {
      recipient?: unknown
      purpose?: unknown
      context?: unknown
      tone?: unknown
      contactId?: unknown
    }

    const recipient = typeof input.recipient === 'string' ? input.recipient.trim().slice(0, 250) : ''
    const purpose = typeof input.purpose === 'string' ? input.purpose.trim().slice(0, 1_000) : ''
    const context = typeof input.context === 'string' ? input.context.trim().slice(0, 20_000) : ''
    const requestedTone = typeof input.tone === 'string' ? input.tone.trim().toLowerCase() : ''
    const tone = ALLOWED_TONES.has(requestedTone) ? requestedTone : 'professional'
    const contactId =
      typeof input.contactId === 'string' && input.contactId.trim() ? input.contactId.trim() : null

    if (!purpose) {
      return NextResponse.json({ error: 'Email purpose is required.' }, { status: 400 })
    }

    const rawResult = await generateStructuredAI<GeneratedEmail>({
      system:
        'Write professional, natural business emails. Do not make unsupported promises. Return a plain-text body, not HTML.',
      prompt: `Recipient: ${recipient || 'Customer'}\nPurpose: ${purpose}\nTone: ${tone}\nContext: ${context || 'No extra context'}`,
      schemaDescription: { subject: 'string', body: 'string' },
    })
    const result = validateGeneratedEmail(rawResult)

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('ai_generated_emails')
      .insert({
        organization_id: organization.organization_id,
        contact_id: contactId,
        recipient_name: recipient || null,
        purpose,
        tone,
        context: context || null,
        subject: result.subject,
        body: result.body,
      })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ email: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Email generation failed.' },
      { status: 500 },
    )
  }
}

import { NextResponse } from 'next/server'
import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { generateStructuredAI } from '@/lib/ai/provider'

type EmailResult = { subject: string; body: string }
export async function POST(request: Request) {
  try {
    const organization = await requireOrganization()
    const input = (await request.json()) as { recipient?: string; purpose?: string; context?: string; tone?: string; contactId?: string }
    if (!input.purpose?.trim()) return NextResponse.json({ error: 'Email purpose is required.' }, { status: 400 })
    const result = await generateStructuredAI<EmailResult>({
      system: 'Write professional, natural business emails. Do not make unsupported promises. Return plain text body, not HTML.',
      prompt: `Recipient: ${input.recipient ?? 'Customer'}\nPurpose: ${input.purpose}\nTone: ${input.tone ?? 'professional'}\nContext: ${input.context ?? 'No extra context'}`,
      schemaDescription: { subject: 'string', body: 'string' },
    })
    const supabase = await createClient()
    const { data, error } = await supabase.from('ai_generated_emails').insert({ organization_id: organization.organization_id, contact_id: input.contactId || null, recipient_name: input.recipient || null, purpose: input.purpose, tone: input.tone || 'professional', context: input.context || null, subject: result.subject, body: result.body }).select('*').single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ email: data })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Email generation failed.' }, { status: 500 }) }
}

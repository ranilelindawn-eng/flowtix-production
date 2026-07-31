import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const ALLOWED_TOPICS = new Set([
  'General inquiry',
  'Account support',
  'Security',
  'Business plan',
])

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\u0000/g, '').slice(0, maxLength)
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function clientIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

async function sendResendEmail(input: {
  to: string[]
  subject: string
  html: string
  replyTo?: string
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.RESEND_FROM_EMAIL?.trim()
  if (!apiKey || !from) throw new Error('Resend is not configured.')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      reply_to: input.replyTo,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Resend rejected the message (${response.status}): ${details.slice(0, 300)}`)
  }
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request)

  try {
    await enforceRateLimit(`contact:${ip}`, 5, 900)

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Unsupported request format.' }, { status: 415 })
    }

    const body = (await request.json()) as Record<string, unknown>
    const name = cleanText(body.name, 120)
    const email = cleanText(body.email, 254).toLowerCase()
    const requestedTopic = cleanText(body.topic, 80)
    const topic = ALLOWED_TOPICS.has(requestedTopic) ? requestedTopic : 'General inquiry'
    const message = cleanText(body.message, 5000)
    const website = cleanText(body.website, 200)

    // Honeypot: return a normal success response so bots do not learn the trap.
    if (website) return NextResponse.json({ ok: true })

    if (name.length < 2 || !isEmail(email) || message.length < 10) {
      return NextResponse.json(
        { error: 'Please provide a valid name, email address, and message.' },
        { status: 400 },
      )
    }

    const supabase = createAdminClient()
    const userAgent = cleanText(request.headers.get('user-agent'), 500)

    const { data: inquiry, error: insertError } = await supabase
      .from('contact_inquiries')
      .insert({
        name,
        email,
        topic,
        message,
        ip_address: ip === 'unknown' ? null : ip,
        user_agent: userAgent || null,
        delivery_status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !inquiry) {
      console.error('Contact inquiry insert failed:', insertError)
      return NextResponse.json(
        { error: 'Your message could not be saved. Please try again.' },
        { status: 500 },
      )
    }

    const ownerEmail = process.env.CONTACT_NOTIFICATION_EMAIL?.trim()
    let deliveryStatus = 'stored'
    let deliveryError: string | null = null

    try {
      if (!ownerEmail || !isEmail(ownerEmail)) {
        throw new Error('CONTACT_NOTIFICATION_EMAIL is missing or invalid.')
      }

      const safeName = escapeHtml(name)
      const safeEmail = escapeHtml(email)
      const safeTopic = escapeHtml(topic)
      const safeMessage = escapeHtml(message).replaceAll('\n', '<br />')

      await sendResendEmail({
        to: [ownerEmail],
        replyTo: email,
        subject: `[Flowtix Contact] ${topic} — ${name}`,
        html: `<h2>New Flowtix inquiry</h2><p><strong>Name:</strong> ${safeName}</p><p><strong>Email:</strong> ${safeEmail}</p><p><strong>Topic:</strong> ${safeTopic}</p><p><strong>Message:</strong></p><p>${safeMessage}</p><hr /><p>Inquiry ID: ${inquiry.id}</p>`,
      })

      await sendResendEmail({
        to: [email],
        subject: 'We received your Flowtix message',
        html: `<p>Hi ${safeName},</p><p>Thank you for contacting Flowtix. We received your message about <strong>${safeTopic}</strong> and will respond as soon as possible.</p><p>Reference: ${inquiry.id}</p><p>— The Flowtix team</p>`,
      })

      deliveryStatus = 'sent'
    } catch (error) {
      deliveryStatus = 'failed'
      deliveryError = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown delivery error'
      console.error('Contact email delivery failed:', error)
    }

    await supabase
      .from('contact_inquiries')
      .update({
        delivery_status: deliveryStatus,
        delivery_error: deliveryError,
        delivered_at: deliveryStatus === 'sent' ? new Date().toISOString() : null,
      })
      .eq('id', inquiry.id)

    return NextResponse.json({ ok: true, reference: inquiry.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('Too many requests')) {
      return NextResponse.json(
        { error: 'Too many messages were submitted. Please wait before trying again.' },
        { status: 429 },
      )
    }

    console.error('Contact endpoint failed:', error)
    return NextResponse.json(
      { error: 'The message could not be submitted. Please try again.' },
      { status: 500 },
    )
  }
}

import { createHmac, timingSafeEqual } from 'node:crypto'

const MOCEAN_BASE_URL = 'https://rest.moceanapi.com/rest/2'

export type MoceanCallIdentifiers = {
  status: number
  sessionUuid: string
  callUuid: string
  errorMessage: string | null
}

export function isMoceanManagedOutboundConfigured(): boolean {
  return Boolean(process.env.MOCEAN_API_TOKEN?.trim())
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

export function normalizeE164(value: string): string {
  let phone = value.trim().replace(/[\s().-]/g, '')
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error('Phone numbers must use international E.164 format, for example +639171234567.')
  }
  return phone
}

function moceanNumber(e164: string): string {
  return normalizeE164(e164).slice(1)
}

function publicSiteUrl(): string {
  const raw = requiredEnv('NEXT_PUBLIC_SITE_URL')
  const parsed = new URL(raw)
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_SITE_URL must use HTTPS in production.')
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, '')
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

function eventSignature(callId: string): string {
  return createHmac('sha256', requiredEnv('MOCEAN_API_TOKEN'))
    .update(`flowtix:mocean:event:${callId}`)
    .digest('hex')
}

export function buildMoceanEventUrl(callId: string): string {
  const url = new URL('/api/telephony/mocean/events', publicSiteUrl())
  url.searchParams.set('callId', callId)
  url.searchParams.set('sig', eventSignature(callId))
  return url.toString()
}

export function verifyMoceanEventSignature(callId: string, signature: string): boolean {
  if (!callId || !signature) return false
  const expected = eventSignature(callId)
  const left = Buffer.from(expected)
  const right = Buffer.from(signature)
  return left.length === right.length && timingSafeEqual(left, right)
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return Number.NaN
}

function firstCallRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {}
  const root = payload as Record<string, unknown>
  const calls = root.calls
  if (calls && typeof calls === 'object') {
    const call = (calls as Record<string, unknown>).call
    if (Array.isArray(call)) {
      const first = call[0]
      return first && typeof first === 'object' ? first as Record<string, unknown> : {}
    }
    if (call && typeof call === 'object') return call as Record<string, unknown>
  }
  return root
}

function parseCallResponse(payload: unknown): MoceanCallIdentifiers {
  const record = firstCallRecord(payload)
  const status = readNumber(record.status)
  return {
    status: Number.isFinite(status) ? status : 9,
    sessionUuid: readText(record.session_uuid) || readText(record['session-uuid']),
    callUuid: readText(record.call_uuid) || readText(record['call-uuid']),
    errorMessage: readText(record.err_msg) || readText(record.message) || null,
  }
}

async function moceanRequest(path: string, body: URLSearchParams): Promise<unknown> {
  const response = await fetch(`${MOCEAN_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredEnv('MOCEAN_API_TOKEN')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
    cache: 'no-store',
  })

  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { status: response.ok ? 0 : response.status, err_msg: text.slice(0, 500) }
  }

  if (!response.ok) {
    const parsed = parseCallResponse(payload)
    throw new Error(parsed.errorMessage || `Mocean returned HTTP ${response.status}.`)
  }
  return payload
}

export async function startMoceanManagedCall(input: {
  callId: string
  agentNumber: string
  destinationNumber: string
  recordCall: boolean
}): Promise<MoceanCallIdentifiers> {
  const command: Array<Record<string, unknown>> = []
  if (input.recordCall) command.push({ action: 'record' })
  command.push({ action: 'dial', to: moceanNumber(input.destinationNumber) })

  const body = new URLSearchParams()
  body.set('mocean-to', moceanNumber(input.agentNumber))
  body.set('mocean-command', JSON.stringify(command))
  body.set('mocean-resp-format', 'JSON')
  body.set('mocean-event-url', buildMoceanEventUrl(input.callId))

  const callerId = process.env.MOCEAN_OUTBOUND_CALLER_ID?.trim()
  if (callerId) body.set('mocean-from', moceanNumber(callerId))

  const result = parseCallResponse(await moceanRequest('/voice/dial', body))
  if (result.status !== 0 || !result.callUuid) {
    throw new Error(result.errorMessage || `Mocean rejected the call with status ${result.status}.`)
  }
  return result
}

export async function hangupMoceanCall(callUuid: string): Promise<void> {
  if (!callUuid.trim()) throw new Error('Mocean call UUID is required.')
  const body = new URLSearchParams()
  body.set('mocean-call-uuid', callUuid.trim())
  body.set('mocean-resp-format', 'JSON')
  const result = parseCallResponse(await moceanRequest('/voice/hangup', body))
  if (result.status !== 0) {
    throw new Error(result.errorMessage || `Mocean rejected hangup with status ${result.status}.`)
  }
}

export async function fetchMoceanRecording(callUuid: string): Promise<Response> {
  const url = new URL(`${MOCEAN_BASE_URL}/voice/rec`)
  url.searchParams.set('mocean-call-uuid', callUuid.trim())
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${requiredEnv('MOCEAN_API_TOKEN')}` },
    cache: 'no-store',
    redirect: 'follow',
  })
  if (!response.ok || !response.body) {
    const detail = (await response.text().catch(() => '')).trim().slice(0, 500)
    throw new Error(`Mocean recording returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`)
  }
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.includes('application/json') || contentType.includes('xml') || contentType.startsWith('text/')) {
    const detail = (await response.text().catch(() => '')).trim().slice(0, 500)
    throw new Error(`Mocean recording is not ready or unavailable${detail ? `: ${detail}` : '.'}`)
  }
  return response
}

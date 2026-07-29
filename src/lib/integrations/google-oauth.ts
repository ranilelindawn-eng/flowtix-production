import { createHmac, timingSafeEqual } from 'node:crypto'

type GoogleState = {
  organizationId: string
  userId: string
  service: 'gmail'
  expiresAt: number
  nonce: string
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name} environment variable.`)
  return value
}

export function getGoogleOAuthConfig(origin: string) {
  return {
    clientId: required('GOOGLE_CLIENT_ID'),
    clientSecret: required('GOOGLE_CLIENT_SECRET'),
    redirectUri: process.env.GOOGLE_INTEGRATION_REDIRECT_URI?.trim() || `${origin}/api/integrations/google/callback`,
  }
}

export function createGoogleState(payload: GoogleState) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = createHmac('sha256', required('INTEGRATION_STATE_SECRET')).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyGoogleState(value: string): GoogleState {
  const [encoded, signature] = value.split('.')
  if (!encoded || !signature) throw new Error('Invalid OAuth state.')
  const expected = createHmac('sha256', required('INTEGRATION_STATE_SECRET')).update(encoded).digest('base64url')
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error('OAuth state validation failed.')
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as GoogleState
  if (payload.expiresAt < Date.now()) throw new Error('OAuth state expired.')
  if (payload.service !== 'gmail') throw new Error('Unsupported Google integration service.')
  return payload
}

export function buildGoogleAuthorizationUrl(origin: string, state: string) {
  const { clientId, redirectUri } = getGoogleOAuthConfig(origin)
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('scope', [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
  ].join(' '))
  url.searchParams.set('state', state)
  return url
}

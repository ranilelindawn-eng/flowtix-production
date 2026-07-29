import { createHmac, timingSafeEqual } from 'node:crypto'

export type IntegrationOAuthState = {
  organizationId: string
  userId: string
  provider: 'gmail' | 'google-calendar' | 'outlook' | 'microsoft-teams' | 'slack' | 'zoom'
  expiresAt: number
  nonce: string
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name} environment variable.`)
  return value
}

export function createIntegrationState(payload: IntegrationOAuthState) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = createHmac('sha256', required('INTEGRATION_STATE_SECRET')).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyIntegrationState(value: string): IntegrationOAuthState {
  const [encoded, signature] = value.split('.')
  if (!encoded || !signature) throw new Error('Invalid OAuth state.')

  const expected = createHmac('sha256', required('INTEGRATION_STATE_SECRET')).update(encoded).digest('base64url')
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error('OAuth state validation failed.')
  }

  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as IntegrationOAuthState
  if (payload.expiresAt < Date.now()) throw new Error('OAuth state expired.')
  return payload
}

export function getProductionOrigin(requestOrigin: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return configured ? configured.replace(/\/$/, '') : requestOrigin.replace(/\/$/, '')
}

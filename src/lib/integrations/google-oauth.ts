import type { IntegrationOAuthState } from './oauth-state'
import { createIntegrationState, verifyIntegrationState } from './oauth-state'

export type GoogleService = Extract<IntegrationOAuthState['provider'], 'gmail' | 'google-calendar'>

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

export const createGoogleState = createIntegrationState
export const verifyGoogleState = verifyIntegrationState

export function buildGoogleAuthorizationUrl(origin: string, state: string, service: GoogleService) {
  const { clientId, redirectUri } = getGoogleOAuthConfig(origin)
  const scopes = service === 'gmail'
    ? ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly']
    : ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly']

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent select_account')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('state', state)
  return url
}

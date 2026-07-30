import type { IntegrationOAuthState } from './oauth-state'

export type ExternalOAuthProvider = Extract<IntegrationOAuthState['provider'], 'outlook' | 'microsoft-teams' | 'slack' | 'zoom'>

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name} environment variable.`)
  return value
}

export function buildProviderAuthorizationUrl(provider: ExternalOAuthProvider, origin: string, state: string) {
  const callback = `${origin}/api/integrations/oauth/callback`

  if (provider === 'outlook' || provider === 'microsoft-teams') {
    const tenant = process.env.MICROSOFT_TENANT_ID?.trim() || 'common'
    const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`)
    url.searchParams.set('client_id', required('MICROSOFT_CLIENT_ID'))
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('redirect_uri', process.env.MICROSOFT_INTEGRATION_REDIRECT_URI?.trim() || callback)
    url.searchParams.set('response_mode', 'query')
    url.searchParams.set('state', state)
    url.searchParams.set('prompt', 'select_account')
    const scopes = provider === 'outlook'
      ? ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.Read', 'Mail.Send', 'Calendars.ReadWrite']
      : ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'OnlineMeetings.ReadWrite', 'Team.ReadBasic.All', 'Channel.ReadBasic.All']
    url.searchParams.set('scope', scopes.join(' '))
    return url
  }

  if (provider === 'slack') {
    const url = new URL('https://slack.com/oauth/v2/authorize')
    url.searchParams.set('client_id', required('SLACK_CLIENT_ID'))
    url.searchParams.set('redirect_uri', process.env.SLACK_INTEGRATION_REDIRECT_URI?.trim() || callback)
    url.searchParams.set('state', state)
    url.searchParams.set('scope', 'channels:read,chat:write,team:read,users:read')
    return url
  }

  const url = new URL('https://zoom.us/oauth/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', required('ZOOM_CLIENT_ID'))
  url.searchParams.set('redirect_uri', process.env.ZOOM_INTEGRATION_REDIRECT_URI?.trim() || callback)
  url.searchParams.set('state', state)
  return url
}

export async function exchangeProviderCode(provider: ExternalOAuthProvider, origin: string, code: string) {
  const callback = `${origin}/api/integrations/oauth/callback`

  if (provider === 'outlook' || provider === 'microsoft-teams') {
    const tenant = process.env.MICROSOFT_TENANT_ID?.trim() || 'common'
    const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: required('MICROSOFT_CLIENT_ID'),
        client_secret: required('MICROSOFT_CLIENT_SECRET'),
        code,
        redirect_uri: process.env.MICROSOFT_INTEGRATION_REDIRECT_URI?.trim() || callback,
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
    })
    const body = await response.json() as Record<string, unknown>
    if (!response.ok || typeof body.access_token !== 'string') throw new Error(String(body.error_description ?? 'Microsoft token exchange failed.'))
    return body
  }

  if (provider === 'slack') {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: required('SLACK_CLIENT_ID'),
        client_secret: required('SLACK_CLIENT_SECRET'),
        code,
        redirect_uri: process.env.SLACK_INTEGRATION_REDIRECT_URI?.trim() || callback,
      }),
      cache: 'no-store',
    })
    const body = await response.json() as Record<string, unknown>
    if (!response.ok || body.ok !== true || typeof body.access_token !== 'string') throw new Error(String(body.error ?? 'Slack token exchange failed.'))
    return body
  }

  const credentials = Buffer.from(`${required('ZOOM_CLIENT_ID')}:${required('ZOOM_CLIENT_SECRET')}`).toString('base64')
  const response = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.ZOOM_INTEGRATION_REDIRECT_URI?.trim() || callback,
    }),
    cache: 'no-store',
  })
  const body = await response.json() as Record<string, unknown>
  if (!response.ok || typeof body.access_token !== 'string') throw new Error(String(body.reason ?? 'Zoom token exchange failed.'))
  return body
}

export async function fetchProviderIdentity(provider: ExternalOAuthProvider, tokenData: Record<string, unknown>) {
  const accessToken = String(tokenData.access_token)
  if (provider === 'outlook' || provider === 'microsoft-teams') {
    const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
    })
    const body = await response.json() as { id?: string; displayName?: string; mail?: string; userPrincipalName?: string }
    if (!response.ok || !body.id) throw new Error('Unable to read Microsoft account identity.')
    return { id: body.id, name: body.displayName ?? body.mail ?? 'Microsoft account', email: body.mail ?? body.userPrincipalName ?? null }
  }

  if (provider === 'slack') {
    const auth = tokenData.authed_user as { id?: string } | undefined
    const team = tokenData.team as { id?: string; name?: string } | undefined
    return { id: team?.id ?? auth?.id ?? 'slack', name: team?.name ?? 'Slack workspace', email: null }
  }

  const response = await fetch('https://api.zoom.us/v2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
  })
  const body = await response.json() as { id?: string; first_name?: string; last_name?: string; email?: string }
  if (!response.ok || !body.id) throw new Error('Unable to read Zoom account identity.')
  return { id: body.id, name: `${body.first_name ?? ''} ${body.last_name ?? ''}`.trim() || body.email || 'Zoom account', email: body.email ?? null }
}

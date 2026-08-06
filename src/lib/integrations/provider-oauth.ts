import type { IntegrationOAuthState } from './oauth-state'

export type ExternalOAuthProvider = Extract<
  IntegrationOAuthState['provider'],
  'outlook' | 'microsoft-teams' | 'slack' | 'zoom'
>

type OAuthTokenData = Record<string, unknown>

function required(name: string) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(
      `Missing ${name} environment variable.`,
    )
  }

  return value
}

function getCallbackUrl(origin: string) {
  return `${origin}/api/integrations/oauth/callback`
}

function getMicrosoftRedirectUri(origin: string) {
  return (
    process.env.MICROSOFT_INTEGRATION_REDIRECT_URI?.trim() ||
    getCallbackUrl(origin)
  )
}

function getSlackRedirectUri(origin: string) {
  return (
    process.env.SLACK_INTEGRATION_REDIRECT_URI?.trim() ||
    getCallbackUrl(origin)
  )
}

function getZoomRedirectUri(origin: string) {
  return (
    process.env.ZOOM_INTEGRATION_REDIRECT_URI?.trim() ||
    getCallbackUrl(origin)
  )
}

async function readJsonResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text) as Record<
      string,
      unknown
    >
  } catch {
    return {
      raw_response: text,
    }
  }
}

function getAccessToken(
  tokenData: OAuthTokenData,
) {
  const accessToken = tokenData.access_token

  if (
    typeof accessToken !== 'string' ||
    accessToken.trim().length === 0
  ) {
    throw new Error(
      'The provider did not return a valid access token.',
    )
  }

  return accessToken
}

export function buildProviderAuthorizationUrl(
  provider: ExternalOAuthProvider,
  origin: string,
  state: string,
) {
  if (
    provider === 'outlook' ||
    provider === 'microsoft-teams'
  ) {
    const tenant =
      process.env.MICROSOFT_TENANT_ID?.trim() ||
      'common'

    const url = new URL(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    )

    url.searchParams.set(
      'client_id',
      required('MICROSOFT_CLIENT_ID'),
    )

    url.searchParams.set(
      'response_type',
      'code',
    )

    url.searchParams.set(
      'redirect_uri',
      getMicrosoftRedirectUri(origin),
    )

    url.searchParams.set(
      'response_mode',
      'query',
    )

    url.searchParams.set('state', state)
    url.searchParams.set(
      'prompt',
      'select_account',
    )

    const scopes =
      provider === 'outlook'
        ? [
            'openid',
            'profile',
            'email',
            'offline_access',
            'User.Read',
            'Mail.Read',
            'Mail.Send',
            'Calendars.ReadWrite',
          ]
        : [
            'openid',
            'profile',
            'email',
            'offline_access',
            'User.Read',
            'OnlineMeetings.ReadWrite',
            'Team.ReadBasic.All',
            'Channel.ReadBasic.All',
          ]

    url.searchParams.set(
      'scope',
      scopes.join(' '),
    )

    return url
  }

  if (provider === 'slack') {
    const url = new URL(
      'https://slack.com/oauth/v2/authorize',
    )

    url.searchParams.set(
      'client_id',
      required('SLACK_CLIENT_ID'),
    )

    url.searchParams.set(
      'redirect_uri',
      getSlackRedirectUri(origin),
    )

    url.searchParams.set('state', state)

    url.searchParams.set(
      'scope',
      'channels:read,chat:write,team:read,users:read',
    )

    return url
  }

  const url = new URL(
    'https://zoom.us/oauth/authorize',
  )

  url.searchParams.set(
    'response_type',
    'code',
  )

  url.searchParams.set(
    'client_id',
    required('ZOOM_CLIENT_ID'),
  )

  url.searchParams.set(
    'redirect_uri',
    getZoomRedirectUri(origin),
  )

  url.searchParams.set('state', state)

  /*
   * Flowtix requires this scope to identify the
   * subscriber's connected Zoom account.
   */

  /*
   * Preserve any Zoom scopes the subscriber has
   * previously granted when reconnecting.
   */
  

  return url
}

export async function exchangeProviderCode(
  provider: ExternalOAuthProvider,
  origin: string,
  code: string,
): Promise<OAuthTokenData> {
  if (
    provider === 'outlook' ||
    provider === 'microsoft-teams'
  ) {
    const tenant =
      process.env.MICROSOFT_TENANT_ID?.trim() ||
      'common'

    const response = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: required(
            'MICROSOFT_CLIENT_ID',
          ),
          client_secret: required(
            'MICROSOFT_CLIENT_SECRET',
          ),
          code,
          redirect_uri:
            getMicrosoftRedirectUri(origin),
          grant_type: 'authorization_code',
        }),
        cache: 'no-store',
      },
    )

    const body =
      await readJsonResponse(response)

    if (
      !response.ok ||
      typeof body.access_token !== 'string'
    ) {
      throw new Error(
        typeof body.error_description ===
          'string'
          ? body.error_description
          : 'Microsoft token exchange failed.',
      )
    }

    return body
  }

  if (provider === 'slack') {
    const response = await fetch(
      'https://slack.com/api/oauth.v2.access',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: required(
            'SLACK_CLIENT_ID',
          ),
          client_secret: required(
            'SLACK_CLIENT_SECRET',
          ),
          code,
          redirect_uri:
            getSlackRedirectUri(origin),
        }),
        cache: 'no-store',
      },
    )

    const body =
      await readJsonResponse(response)

    if (
      !response.ok ||
      body.ok !== true ||
      typeof body.access_token !== 'string'
    ) {
      throw new Error(
        typeof body.error === 'string'
          ? body.error
          : 'Slack token exchange failed.',
      )
    }

    return body
  }

  const credentials = Buffer.from(
    `${required('ZOOM_CLIENT_ID')}:${required(
      'ZOOM_CLIENT_SECRET',
    )}`,
  ).toString('base64')

  const response = await fetch(
    'https://zoom.us/oauth/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri:
          getZoomRedirectUri(origin),
      }),
      cache: 'no-store',
    },
  )

  const body =
    await readJsonResponse(response)

  if (
    !response.ok ||
    typeof body.access_token !== 'string'
  ) {
    console.error(
      'ZOOM TOKEN EXCHANGE FAILED',
      {
        status: response.status,
        response: body,
      },
    )

    throw new Error(
      typeof body.reason === 'string'
        ? body.reason
        : typeof body.error_description ===
            'string'
          ? body.error_description
          : typeof body.error === 'string'
            ? body.error
            : 'Zoom token exchange failed.',
    )
  }


  return body
}

export async function fetchProviderIdentity(
  provider: ExternalOAuthProvider,
  tokenData: OAuthTokenData,
) {
  const accessToken =
    getAccessToken(tokenData)

  if (
    provider === 'outlook' ||
    provider === 'microsoft-teams'
  ) {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      },
    )

    const body =
      await readJsonResponse(response)

    if (
      !response.ok ||
      typeof body.id !== 'string'
    ) {
      console.error(
        'MICROSOFT IDENTITY REQUEST FAILED',
        {
          status: response.status,
          response: body,
        },
      )

      throw new Error(
        'Unable to read Microsoft account identity.',
      )
    }

    const displayName =
      typeof body.displayName === 'string'
        ? body.displayName
        : null

    const mail =
      typeof body.mail === 'string'
        ? body.mail
        : null

    const userPrincipalName =
      typeof body.userPrincipalName ===
      'string'
        ? body.userPrincipalName
        : null

    return {
      id: body.id,
      name:
        displayName ??
        mail ??
        userPrincipalName ??
        'Microsoft account',
      email:
        mail ?? userPrincipalName ?? null,
    }
  }

  if (provider === 'slack') {
    const auth =
      tokenData.authed_user as
        | {
            id?: string
          }
        | undefined

    const team =
      tokenData.team as
        | {
            id?: string
            name?: string
          }
        | undefined

    return {
      id:
        team?.id ??
        auth?.id ??
        'slack',
      name:
        team?.name ??
        'Slack workspace',
      email: null,
    }
  }

  const response = await fetch(
    'https://api.zoom.us/v2/users/me',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  )

  const body =
    await readJsonResponse(response)


  if (
    !response.ok ||
    typeof body.id !== 'string'
  ) {
    console.error(
      'ZOOM IDENTITY REQUEST FAILED',
      {
        status: response.status,
        response: body,
        tokenScope:
          typeof tokenData.scope === 'string'
            ? tokenData.scope
            : null,
      },
    )

    const zoomMessage =
      typeof body.message === 'string'
        ? body.message
        : 'Unable to read Zoom account identity.'

    throw new Error(
      `Unable to read Zoom account identity. Zoom returned HTTP ${response.status}: ${zoomMessage}`,
    )
  }

  const firstName =
    typeof body.first_name === 'string'
      ? body.first_name
      : ''

  const lastName =
    typeof body.last_name === 'string'
      ? body.last_name
      : ''

  const email =
    typeof body.email === 'string'
      ? body.email
      : null

  const fullName =
    `${firstName} ${lastName}`.trim()

  return {
    id: body.id,
    name:
      fullName ||
      email ||
      'Zoom account',
    email,
  }
}
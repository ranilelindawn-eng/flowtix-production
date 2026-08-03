import type { IntegrationOAuthState } from './oauth-state'

export type ExternalOAuthProvider = Extract<
  IntegrationOAuthState['provider'],
  'outlook' | 'microsoft-teams' | 'slack' | 'zoom'
>

type OAuthTokenData = Record<string, unknown>

type MicrosoftIdentityResponse = {
  id?: string
  displayName?: string
  mail?: string
  userPrincipalName?: string
  error?: {
    code?: string
    message?: string
  }
}

type ZoomIdentityResponse = {
  id?: string
  first_name?: string
  last_name?: string
  email?: string
  code?: number
  message?: string
}

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

async function readJsonResponse(
  response: Response,
): Promise<unknown> {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return {
      raw_response: text,
    }
  }
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

    url.searchParams.set(
      'state',
      state,
    )

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

    url.searchParams.set(
      'state',
      state,
    )

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

  url.searchParams.set(
    'state',
    state,
  )

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
      (await readJsonResponse(
        response,
      )) as OAuthTokenData | null

    if (
      !response.ok ||
      !body ||
      typeof body.access_token !== 'string'
    ) {
      const description =
        body &&
        typeof body.error_description ===
          'string'
          ? body.error_description
          : 'Microsoft token exchange failed.'

      throw new Error(description)
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
      (await readJsonResponse(
        response,
      )) as OAuthTokenData | null

    if (
      !response.ok ||
      !body ||
      body.ok !== true ||
      typeof body.access_token !== 'string'
    ) {
      const slackError =
        body &&
        typeof body.error === 'string'
          ? body.error
          : 'Slack token exchange failed.'

      throw new Error(slackError)
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
    (await readJsonResponse(
      response,
    )) as OAuthTokenData | null

  if (
    !response.ok ||
    !body ||
    typeof body.access_token !== 'string'
  ) {
    console.error(
      'ZOOM TOKEN EXCHANGE FAILED',
      {
        status: response.status,
        response: body,
      },
    )

    const reason =
      body &&
      typeof body.reason === 'string'
        ? body.reason
        : body &&
            typeof body.error_description ===
              'string'
          ? body.error_description
          : body &&
              typeof body.error === 'string'
            ? body.error
            : 'Zoom token exchange failed.'

    throw new Error(reason)
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
      (await readJsonResponse(
        response,
      )) as MicrosoftIdentityResponse | null

    if (
      !response.ok ||
      !body ||
      typeof body.id !== 'string'
    ) {
      console.error(
        'MICROSOFT IDENTITY REQUEST FAILED',
        {
          status: response.status,
          response: body,
        },
      )

      const message =
        body?.error?.message ??
        'Unable to read Microsoft account identity.'

      throw new Error(message)
    }

    return {
      id: body.id,
      name:
        body.displayName ??
        body.mail ??
        body.userPrincipalName ??
        'Microsoft account',
      email:
        body.mail ??
        body.userPrincipalName ??
        null,
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
    (await readJsonResponse(
      response,
    )) as ZoomIdentityResponse | null

  console.log(
    'ZOOM IDENTITY RESPONSE',
    {
      status: response.status,
      ok: response.ok,
      zoomCode: body?.code ?? null,
      zoomMessage: body?.message ?? null,
      hasUserId:
        typeof body?.id === 'string',
      hasEmail:
        typeof body?.email === 'string',
    },
  )

  if (
    !response.ok ||
    !body ||
    typeof body.id !== 'string'
  ) {
    console.error(
      'ZOOM IDENTITY REQUEST FAILED',
      {
        status: response.status,
        response: body,
      },
    )

    const zoomMessage =
      typeof body?.message === 'string'
        ? body.message
        : 'Unable to read Zoom account identity.'

    throw new Error(
      `Unable to read Zoom account identity. Zoom returned HTTP ${response.status}: ${zoomMessage}`,
    )
  }

  const fullName = [
    body.first_name,
    body.last_name,
  ]
    .filter(
      (value): value is string =>
        typeof value === 'string' &&
        value.trim().length > 0,
    )
    .join(' ')
    .trim()

  return {
    id: body.id,
    name:
      fullName ||
      body.email ||
      'Zoom account',
    email:
      typeof body.email === 'string'
        ? body.email
        : null,
  }
}
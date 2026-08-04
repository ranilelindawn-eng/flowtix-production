import { createClient } from '@supabase/supabase-js'

import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from '@/lib/integrations/crypto'
import {
  NonRetryableJobError,
  type JsonValue,
} from '@/lib/jobs/types'

type SupportedProvider =
  | 'gmail'
  | 'google-calendar'
  | 'outlook'
  | 'microsoft-teams'
  | 'zoom'
  | 'slack'

type MaintenanceOperation = 'refresh' | 'health'

type MaintenancePayload = {
  organizationId: string
  integrationId: string
  provider: SupportedProvider
  operation: MaintenanceOperation
}

type Credentials = Record<string, unknown>

type IntegrationRecord = {
  id: string
  organization_id: string
  provider: SupportedProvider
  enabled: boolean
  status: string
  config: Record<string, unknown>
  token_expires_at: string | null
  consecutive_failures: number
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service-role configuration for integration maintenance.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new NonRetryableJobError(
      `Missing ${name} environment variable.`,
      'INTEGRATION_CONFIGURATION_MISSING',
    )
  }

  return value
}

function requiredString(value: unknown, label: string) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new NonRetryableJobError(
      `${label} is required.`,
      'INVALID_INTEGRATION_MAINTENANCE_PAYLOAD',
    )
  }

  return value.trim()
}

function parsePayload(value: JsonValue): MaintenancePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NonRetryableJobError(
      'Integration maintenance payload must be an object.',
      'INVALID_INTEGRATION_MAINTENANCE_PAYLOAD',
    )
  }

  const payload = value as Record<string, JsonValue>
  const provider = requiredString(
    payload.provider,
    'Integration provider',
  ) as SupportedProvider
  const operation = requiredString(
    payload.operation,
    'Maintenance operation',
  ) as MaintenanceOperation

  if (
    ![
      'gmail',
      'google-calendar',
      'outlook',
      'microsoft-teams',
      'zoom',
      'slack',
    ].includes(provider)
  ) {
    throw new NonRetryableJobError(
      `Provider ${provider} is not supported by the OAuth worker.`,
      'UNSUPPORTED_INTEGRATION_PROVIDER',
    )
  }

  if (operation !== 'refresh' && operation !== 'health') {
    throw new NonRetryableJobError(
      'Integration maintenance operation is unsupported.',
      'INVALID_INTEGRATION_MAINTENANCE_OPERATION',
    )
  }

  return {
    organizationId: requiredString(
      payload.organizationId,
      'Organization ID',
    ),
    integrationId: requiredString(
      payload.integrationId,
      'Integration ID',
    ),
    provider,
    operation,
  }
}

function credentialString(
  credentials: Credentials,
  ...names: string[]
) {
  for (const name of names) {
    const value = credentials[name]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function accessToken(credentials: Credentials) {
  return credentialString(
    credentials,
    'accessToken',
    'access_token',
  )
}

function refreshToken(credentials: Credentials) {
  return credentialString(
    credentials,
    'refreshToken',
    'refresh_token',
  )
}

function tokenExpiresAt(credentials: Credentials) {
  const raw = credentialString(
    credentials,
    'expiresAt',
    'expires_at',
  )

  if (!raw) {
    return null
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString()
}

async function responseJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { raw: text }
  }
}

function updatedCredentials(
  previous: Credentials,
  payload: Record<string, unknown>,
) {
  const access =
    typeof payload.access_token === 'string'
      ? payload.access_token
      : accessToken(previous)
  const refresh =
    typeof payload.refresh_token === 'string'
      ? payload.refresh_token
      : refreshToken(previous)
  const expiresIn =
    typeof payload.expires_in === 'number'
      ? payload.expires_in
      : 3600
  const expiresAt = new Date(
    Date.now() + expiresIn * 1000,
  ).toISOString()

  return {
    ...previous,
    ...payload,
    accessToken: access,
    access_token: access,
    refreshToken: refresh || undefined,
    refresh_token: refresh || undefined,
    expiresAt,
    expires_at: expiresAt,
  }
}

async function refreshGoogle(credentials: Credentials) {
  const refresh = refreshToken(credentials)

  if (!refresh) {
    throw new NonRetryableJobError(
      'Google refresh token is unavailable. Reconnect the integration.',
      'REAUTHORIZATION_REQUIRED',
    )
  }

  const response = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: requiredEnv('GOOGLE_CLIENT_ID'),
        client_secret: requiredEnv(
          'GOOGLE_CLIENT_SECRET',
        ),
        refresh_token: refresh,
        grant_type: 'refresh_token',
      }),
      cache: 'no-store',
    },
  )
  const payload = await responseJson(response)

  if (
    !response.ok ||
    typeof payload.access_token !== 'string'
  ) {
    const detail =
      typeof payload.error_description === 'string'
        ? payload.error_description
        : typeof payload.error === 'string'
          ? payload.error
          : 'Google token refresh failed.'

    if (
      detail.includes('invalid_grant') ||
      detail.toLowerCase().includes('revoked')
    ) {
      throw new NonRetryableJobError(
        'Google authorization is no longer valid. Reconnect the integration.',
        'REAUTHORIZATION_REQUIRED',
      )
    }

    throw new Error(detail)
  }

  return updatedCredentials(credentials, payload)
}

async function refreshMicrosoft(credentials: Credentials) {
  const refresh = refreshToken(credentials)

  if (!refresh) {
    throw new NonRetryableJobError(
      'Microsoft refresh token is unavailable. Reconnect the integration.',
      'REAUTHORIZATION_REQUIRED',
    )
  }

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
        client_id: requiredEnv(
          'MICROSOFT_CLIENT_ID',
        ),
        client_secret: requiredEnv(
          'MICROSOFT_CLIENT_SECRET',
        ),
        refresh_token: refresh,
        grant_type: 'refresh_token',
        scope: [
          'openid',
          'profile',
          'email',
          'offline_access',
          'User.Read',
          'Mail.Read',
          'Mail.Send',
          'Calendars.ReadWrite',
          'OnlineMeetings.ReadWrite',
          'Team.ReadBasic.All',
          'Channel.ReadBasic.All',
        ].join(' '),
      }),
      cache: 'no-store',
    },
  )
  const payload = await responseJson(response)

  if (
    !response.ok ||
    typeof payload.access_token !== 'string'
  ) {
    const detail =
      typeof payload.error_description === 'string'
        ? payload.error_description
        : 'Microsoft token refresh failed.'

    if (
      detail.includes('AADSTS700082') ||
      detail.includes('AADSTS50173') ||
      detail.toLowerCase().includes('reconnect')
    ) {
      throw new NonRetryableJobError(
        'Microsoft authorization is no longer valid. Reconnect the integration.',
        'REAUTHORIZATION_REQUIRED',
      )
    }

    throw new Error(detail)
  }

  return updatedCredentials(credentials, payload)
}

async function refreshZoom(credentials: Credentials) {
  const refresh = refreshToken(credentials)

  if (!refresh) {
    throw new NonRetryableJobError(
      'Zoom refresh token is unavailable. Reconnect Zoom.',
      'REAUTHORIZATION_REQUIRED',
    )
  }

  const basic = Buffer.from(
    `${requiredEnv('ZOOM_CLIENT_ID')}:${requiredEnv('ZOOM_CLIENT_SECRET')}`,
  ).toString('base64')
  const response = await fetch(
    'https://zoom.us/oauth/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
      }),
      cache: 'no-store',
    },
  )
  const payload = await responseJson(response)

  if (
    !response.ok ||
    typeof payload.access_token !== 'string'
  ) {
    const detail =
      typeof payload.reason === 'string'
        ? payload.reason
        : typeof payload.error_description === 'string'
          ? payload.error_description
          : 'Zoom token refresh failed.'

    if (
      detail.toLowerCase().includes('invalid') ||
      detail.toLowerCase().includes('expired')
    ) {
      throw new NonRetryableJobError(
        'Zoom authorization is no longer valid. Reconnect Zoom.',
        'REAUTHORIZATION_REQUIRED',
      )
    }

    throw new Error(detail)
  }

  return updatedCredentials(credentials, payload)
}

async function refreshSlack(credentials: Credentials) {
  const refresh = refreshToken(credentials)

  if (!refresh) {
    return credentials
  }

  const response = await fetch(
    'https://slack.com/api/oauth.v2.access',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: requiredEnv('SLACK_CLIENT_ID'),
        client_secret: requiredEnv(
          'SLACK_CLIENT_SECRET',
        ),
        grant_type: 'refresh_token',
        refresh_token: refresh,
      }),
      cache: 'no-store',
    },
  )
  const payload = await responseJson(response)

  if (
    !response.ok ||
    payload.ok !== true ||
    typeof payload.access_token !== 'string'
  ) {
    const detail =
      typeof payload.error === 'string'
        ? payload.error
        : 'Slack token refresh failed.'

    if (
      detail === 'invalid_refresh_token' ||
      detail === 'token_revoked'
    ) {
      throw new NonRetryableJobError(
        'Slack authorization is no longer valid. Reconnect Slack.',
        'REAUTHORIZATION_REQUIRED',
      )
    }

    throw new Error(detail)
  }

  return updatedCredentials(credentials, payload)
}

async function refreshCredentials(
  provider: SupportedProvider,
  credentials: Credentials,
) {
  if (
    provider === 'gmail' ||
    provider === 'google-calendar'
  ) {
    return refreshGoogle(credentials)
  }

  if (
    provider === 'outlook' ||
    provider === 'microsoft-teams'
  ) {
    return refreshMicrosoft(credentials)
  }

  if (provider === 'zoom') {
    return refreshZoom(credentials)
  }

  return refreshSlack(credentials)
}

async function healthRequest(
  provider: SupportedProvider,
  credentials: Credentials,
) {
  const token = accessToken(credentials)

  if (!token) {
    throw new NonRetryableJobError(
      'The integration has no usable access token.',
      'REAUTHORIZATION_REQUIRED',
    )
  }

  let url: string
  let method = 'GET'

  if (provider === 'gmail') {
    url =
      'https://gmail.googleapis.com/gmail/v1/users/me/profile'
  } else if (provider === 'google-calendar') {
    url =
      'https://www.googleapis.com/calendar/v3/calendars/primary'
  } else if (
    provider === 'outlook' ||
    provider === 'microsoft-teams'
  ) {
    url =
      'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName'
  } else if (provider === 'zoom') {
    url = 'https://api.zoom.us/v2/users/me'
  } else {
    url = 'https://slack.com/api/auth.test'
    method = 'POST'
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(provider === 'slack'
        ? {
            'Content-Type':
              'application/x-www-form-urlencoded',
          }
        : {}),
    },
    cache: 'no-store',
  })
  const payload = await responseJson(response)

  if (
    !response.ok ||
    (provider === 'slack' && payload.ok !== true)
  ) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : typeof payload.message === 'string'
          ? payload.message
          : 'Integration health check failed.'

    if (
      response.status === 401 ||
      response.status === 403 ||
      message.includes('invalid_auth') ||
      message.includes('token_revoked')
    ) {
      throw new NonRetryableJobError(
        `${provider} authorization is no longer valid. Reconnect the integration.`,
        'REAUTHORIZATION_REQUIRED',
      )
    }

    throw new Error(message)
  }

  return payload
}

async function loadIntegration(payload: MaintenancePayload) {
  const client = serviceClient()
  const { data: integration, error } = await client
    .from('organization_integrations')
    .select(
      'id,organization_id,provider,enabled,status,config,token_expires_at,consecutive_failures',
    )
    .eq('id', payload.integrationId)
    .eq('organization_id', payload.organizationId)
    .eq('provider', payload.provider)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Unable to load integration: ${error.message}`,
    )
  }

  if (!integration || !integration.enabled) {
    throw new NonRetryableJobError(
      'The integration is no longer enabled.',
      'INTEGRATION_DISABLED',
    )
  }

  const { data: secret, error: secretError } = await client
    .from('organization_integration_secrets')
    .select('encrypted_credentials')
    .eq('integration_id', integration.id)
    .eq('organization_id', integration.organization_id)
    .maybeSingle()

  if (secretError || !secret) {
    throw new NonRetryableJobError(
      'Integration credentials are unavailable.',
      'INTEGRATION_CREDENTIALS_MISSING',
    )
  }

  return {
    client,
    integration: integration as IntegrationRecord,
    credentials:
      decryptIntegrationSecret<Credentials>(
        secret.encrypted_credentials,
      ),
  }
}

async function recordCheck(input: {
  integration: IntegrationRecord
  operation: MaintenanceOperation
  status: 'passed' | 'failed'
  latencyMs: number
  errorCode?: string | null
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}) {
  const client = serviceClient()

  await client
    .from('integration_health_checks')
    .insert({
      organization_id:
        input.integration.organization_id,
      integration_id: input.integration.id,
      provider: input.integration.provider,
      check_type: input.operation,
      status: input.status,
      latency_ms: input.latencyMs,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
      checked_at: new Date().toISOString(),
    })
}

async function markSuccess(
  integration: IntegrationRecord,
  credentials: Credentials,
  operation: MaintenanceOperation,
) {
  const client = serviceClient()
  const now = new Date().toISOString()
  const expiry = tokenExpiresAt(credentials)

  const { error } = await client
    .from('organization_integrations')
    .update({
      status: 'connected',
      health_status: 'healthy',
      refresh_status: 'idle',
      reauthorization_required: false,
      consecutive_failures: 0,
      last_error: null,
      last_tested_at: now,
      last_test_status: 'passed',
      last_health_check_at: now,
      last_refreshed_at:
        operation === 'refresh' ? now : undefined,
      token_expires_at: expiry,
      next_health_check_at: new Date(
        Date.now() + 15 * 60 * 1000,
      ).toISOString(),
      refresh_lock_until: null,
      refresh_locked_by: null,
      updated_at: now,
    })
    .eq('id', integration.id)
    .eq(
      'organization_id',
      integration.organization_id,
    )

  if (error) {
    throw new Error(
      `Unable to update integration health: ${error.message}`,
    )
  }
}

async function markFailure(
  integration: IntegrationRecord,
  error: unknown,
) {
  const client = serviceClient()
  const message =
    error instanceof Error
      ? error.message
      : 'Integration maintenance failed.'
  const code =
    error instanceof NonRetryableJobError
      ? error.code
      : 'INTEGRATION_MAINTENANCE_FAILED'
  const reauthorization =
    code === 'REAUTHORIZATION_REQUIRED'
  const failures =
    Number(integration.consecutive_failures ?? 0) + 1
  const now = new Date().toISOString()

  await client
    .from('organization_integrations')
    .update({
      status: reauthorization ? 'error' : integration.status,
      health_status: reauthorization
        ? 'reauthorization_required'
        : failures >= 3
          ? 'unhealthy'
          : 'degraded',
      refresh_status: 'failed',
      reauthorization_required: reauthorization,
      consecutive_failures: failures,
      last_error: message,
      last_tested_at: now,
      last_test_status: 'failed',
      last_health_check_at: now,
      next_health_check_at: new Date(
        Date.now() +
          Math.min(60, 5 * 2 ** Math.min(failures, 4)) *
            60 *
            1000,
      ).toISOString(),
      refresh_lock_until: null,
      refresh_locked_by: null,
      updated_at: now,
    })
    .eq('id', integration.id)
    .eq(
      'organization_id',
      integration.organization_id,
    )

  return { code, message }
}

export async function executeIntegrationMaintenance(
  payloadValue: JsonValue,
): Promise<Record<string, JsonValue>> {
  const payload = parsePayload(payloadValue)
  const startedAt = Date.now()
  const loaded = await loadIntegration(payload)
  let credentials = loaded.credentials

  const claim = await loaded.client.rpc(
    'claim_integration_maintenance',
    {
      p_integration_id: payload.integrationId,
      p_worker_id: `job:${payload.operation}`,
      p_lease_seconds: 180,
    },
  )

  if (claim.error) {
    throw new Error(
      `Unable to claim integration maintenance: ${claim.error.message}`,
    )
  }

  if (claim.data !== true) {
    return {
      skipped: true,
      reason:
        'Another worker is already maintaining this integration.',
    }
  }

  try {
    const expiry =
      tokenExpiresAt(credentials)
    const expiringSoon =
      !expiry ||
      new Date(expiry).getTime() <=
        Date.now() + 10 * 60 * 1000

    if (
      payload.operation === 'refresh' ||
      expiringSoon
    ) {
      credentials = await refreshCredentials(
        payload.provider,
        credentials,
      )

      const { error: secretError } =
        await loaded.client
          .from(
            'organization_integration_secrets',
          )
          .update({
            encrypted_credentials:
              encryptIntegrationSecret(credentials),
            updated_at: new Date().toISOString(),
          })
          .eq(
            'integration_id',
            loaded.integration.id,
          )
          .eq(
            'organization_id',
            loaded.integration.organization_id,
          )

      if (secretError) {
        throw new Error(
          `Unable to save refreshed credentials: ${secretError.message}`,
        )
      }
    }

    const health = await healthRequest(
      payload.provider,
      credentials,
    )

    await markSuccess(
      loaded.integration,
      credentials,
      payload.operation,
    )

    await recordCheck({
      integration: loaded.integration,
      operation: payload.operation,
      status: 'passed',
      latencyMs: Date.now() - startedAt,
      metadata: {
        tokenExpiresAt:
          tokenExpiresAt(credentials),
        identityAvailable:
          Object.keys(health).length > 0,
      },
    })

    return {
      ok: true,
      provider: payload.provider,
      operation: payload.operation,
      tokenExpiresAt:
        tokenExpiresAt(credentials),
    }
  } catch (error) {
    const failure = await markFailure(
      loaded.integration,
      error,
    )

    await recordCheck({
      integration: loaded.integration,
      operation: payload.operation,
      status: 'failed',
      latencyMs: Date.now() - startedAt,
      errorCode: failure.code,
      errorMessage: failure.message,
    })

    throw error
  }
}

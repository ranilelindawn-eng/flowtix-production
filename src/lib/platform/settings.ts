import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type Row = Record<string, unknown>

const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const asNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return fallback
}

const asBoolean = (value: unknown): boolean => value === true

export type PlatformSettingsSnapshot = {
  platformName: string
  supportEmail: string
  statusPageUrl: string
  supportSessionMinutes: number
  supportReferenceRequired: boolean
  defaultTimezone: string
  defaultLocale: string
  updatedAt: string | null
}

export type PlatformSupportPolicy = {
  sessionMinutes: number
  referenceRequired: boolean
}

export type PlatformEnvironmentStatus = {
  key: string
  label: string
  category: 'core' | 'billing' | 'security' | 'ai' | 'jobs'
  configured: boolean
  detail: string
}

export async function getPlatformSettings(): Promise<PlatformSettingsSnapshot> {
  await requirePlatformPermission('platform.settings.manage')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_settings_snapshot')

  if (error) {
    throw new Error(`Unable to load Platform Settings: ${error.message}`)
  }

  if (!isRecord(data)) {
    return {
      platformName: 'Flowtix',
      supportEmail: '',
      statusPageUrl: '',
      supportSessionMinutes: 30,
      supportReferenceRequired: false,
      defaultTimezone: 'UTC',
      defaultLocale: 'en',
      updatedAt: null,
    }
  }

  return {
    platformName: asString(data.platformName) || 'Flowtix',
    supportEmail: asString(data.supportEmail),
    statusPageUrl: asString(data.statusPageUrl),
    supportSessionMinutes: asNumber(data.supportSessionMinutes, 30),
    supportReferenceRequired: asBoolean(data.supportReferenceRequired),
    defaultTimezone: asString(data.defaultTimezone) || 'UTC',
    defaultLocale: asString(data.defaultLocale) || 'en',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
  }
}

export async function getPlatformSupportPolicy(): Promise<PlatformSupportPolicy> {
  await requirePlatformPermission('platform.impersonation.use')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_support_policy')

  if (error) {
    throw new Error(`Unable to load support policy: ${error.message}`)
  }

  if (!isRecord(data)) {
    return { sessionMinutes: 30, referenceRequired: false }
  }

  return {
    sessionMinutes: asNumber(data.sessionMinutes, 30),
    referenceRequired: asBoolean(data.referenceRequired),
  }
}

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

function payMongoDetail(): string {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim() ?? ''
  if (key.startsWith('sk_live_')) return 'Live secret key configured'
  if (key.startsWith('sk_test_')) return 'Test secret key configured'
  return key ? 'Secret key configured' : 'Missing'
}

export async function getPlatformEnvironmentStatus(): Promise<
  PlatformEnvironmentStatus[]
> {
  await requirePlatformPermission('platform.settings.manage')

  const googleConfigured =
    configured(process.env.GOOGLE_GENERATIVE_AI_API_KEY) ||
    configured(process.env.GEMINI_API_KEY)

  return [
    {
      key: 'supabase-url',
      label: 'Supabase project URL',
      category: 'core',
      configured: configured(process.env.NEXT_PUBLIC_SUPABASE_URL),
      detail: 'NEXT_PUBLIC_SUPABASE_URL',
    },
    {
      key: 'supabase-service-role',
      label: 'Supabase service role',
      category: 'security',
      configured: configured(process.env.SUPABASE_SERVICE_ROLE_KEY),
      detail: 'SUPABASE_SERVICE_ROLE_KEY',
    },
    {
      key: 'integration-encryption',
      label: 'Integration credential encryption',
      category: 'security',
      configured: configured(process.env.INTEGRATION_ENCRYPTION_KEY),
      detail: 'INTEGRATION_ENCRYPTION_KEY',
    },
    {
      key: 'paymongo',
      label: 'PayMongo',
      category: 'billing',
      configured: configured(process.env.PAYMONGO_SECRET_KEY),
      detail: payMongoDetail(),
    },
    {
      key: 'app-url',
      label: 'Production application URL',
      category: 'core',
      configured:
        configured(process.env.NEXT_PUBLIC_APP_URL) ||
        configured(process.env.NEXT_PUBLIC_SITE_URL),
      detail: 'NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL',
    },
    {
      key: 'job-worker-secret',
      label: 'Internal job worker authentication',
      category: 'jobs',
      configured: configured(process.env.INTERNAL_JOB_WORKER_SECRET),
      detail: 'INTERNAL_JOB_WORKER_SECRET',
    },
    {
      key: 'google-ai',
      label: 'Google Gemini',
      category: 'ai',
      configured: googleConfigured,
      detail: 'GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEY',
    },
    {
      key: 'openai',
      label: 'OpenAI',
      category: 'ai',
      configured: configured(process.env.OPENAI_API_KEY),
      detail: 'OPENAI_API_KEY',
    },
    {
      key: 'anthropic',
      label: 'Anthropic',
      category: 'ai',
      configured: configured(process.env.ANTHROPIC_API_KEY),
      detail: 'ANTHROPIC_API_KEY',
    },
    {
      key: 'compatible-ai',
      label: 'OpenAI-compatible provider',
      category: 'ai',
      configured: configured(process.env.AI_COMPATIBLE_API_KEY),
      detail: 'AI_COMPATIBLE_API_KEY',
    },
  ]
}

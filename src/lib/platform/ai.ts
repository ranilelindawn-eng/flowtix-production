import 'server-only'

import { getAIProviderConfigurations } from '@/lib/ai/config'
import type { AICapability, AIProviderName } from '@/lib/ai/types'
import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type Row = Record<string, unknown>

const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const asNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return 0
}

export type PlatformAIProviderStatus = {
  provider: AIProviderName
  configured: boolean
  priority: number | null
  textModel: string | null
  transcriptionModel: string | null
  capabilities: AICapability[]
  endpointHost: string | null
}

export type PlatformAIMetrics = {
  requestsThisMonth: number
  completedThisMonth: number
  failedThisMonth: number
  inputTokensThisMonth: number
  outputTokensThisMonth: number
  costMicrosThisMonth: number
  organizationsUsingAIThisMonth: number
  requestsLast24Hours: number
  failuresLast24Hours: number
  averageLatencyMsLast24Hours: number
}

export type PlatformAIDimensionMetric = {
  key: string
  label: string
  requests: number
  completed: number
  failed: number
  inputTokens: number
  outputTokens: number
  costMicros: number
  averageLatencyMs: number
  successRate: number
}

export type PlatformAIDiagnostics = {
  featureMetrics: PlatformAIDimensionMetric[]
  modelMetrics: PlatformAIDimensionMetric[]
  promptMetrics: PlatformAIDimensionMetric[]
  providerMetrics: PlatformAIDimensionMetric[]
}

export type PlatformAIHealthCheck = {
  id: string
  provider: AIProviderName
  status: 'success' | 'failed'
  model: string | null
  latencyMs: number | null
  message: string
  actorUserId: string | null
  actorRole: string | null
  createdAt: string
}

const allProviders: AIProviderName[] = [
  'openai',
  'anthropic',
  'google',
  'openai-compatible',
]

function endpointHost(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).host || null
  } catch {
    return null
  }
}

function parseHealthCheck(value: unknown): PlatformAIHealthCheck | null {
  if (!isRecord(value)) return null

  const id = asString(value.id)
  const provider = asString(value.provider) as AIProviderName | null
  const status = asString(value.status)
  const message = asString(value.message)
  const createdAt = asString(value.createdAt)

  if (
    !id ||
    !provider ||
    !allProviders.includes(provider) ||
    (status !== 'success' && status !== 'failed') ||
    !message ||
    !createdAt
  ) {
    return null
  }

  return {
    id,
    provider,
    status,
    model: asString(value.model),
    latencyMs:
      value.latencyMs === null || value.latencyMs === undefined
        ? null
        : asNumber(value.latencyMs),
    message,
    actorUserId: asString(value.actorUserId),
    actorRole: asString(value.actorRole),
    createdAt,
  }
}

export async function getPlatformAIProviders(): Promise<PlatformAIProviderStatus[]> {
  await requirePlatformPermission('platform.ai.manage')

  const configured = getAIProviderConfigurations()
  const byProvider = new Map(
    configured.map((configuration) => [configuration.provider, configuration]),
  )

  return allProviders.map((provider) => {
    const configuration = byProvider.get(provider)

    if (!configuration) {
      return {
        provider,
        configured: false,
        priority: null,
        textModel: null,
        transcriptionModel: null,
        capabilities: [],
        endpointHost: null,
      }
    }

    return {
      provider,
      configured: true,
      priority: configuration.priority,
      textModel: configuration.textModel || null,
      transcriptionModel: configuration.transcriptionModel ?? null,
      capabilities: configuration.capabilities,
      endpointHost: endpointHost(configuration.baseUrl),
    }
  })
}


function parseDimensionMetrics(value: unknown): PlatformAIDimensionMetric[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []

    const key = asString(item.key)
    const label = asString(item.label)
    if (!key || !label) return []

    return [{
      key,
      label,
      requests: asNumber(item.requests),
      completed: asNumber(item.completed),
      failed: asNumber(item.failed),
      inputTokens: asNumber(item.inputTokens),
      outputTokens: asNumber(item.outputTokens),
      costMicros: asNumber(item.costMicros),
      averageLatencyMs: asNumber(item.averageLatencyMs),
      successRate: asNumber(item.successRate),
    }]
  })
}

export async function getPlatformAIMetrics(): Promise<PlatformAIMetrics> {
  await requirePlatformPermission('platform.ai.manage')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_ai_metrics')

  if (error) {
    throw new Error(`Unable to load platform AI metrics: ${error.message}`)
  }

  if (!isRecord(data)) {
    return {
      requestsThisMonth: 0,
      completedThisMonth: 0,
      failedThisMonth: 0,
      inputTokensThisMonth: 0,
      outputTokensThisMonth: 0,
      costMicrosThisMonth: 0,
      organizationsUsingAIThisMonth: 0,
      requestsLast24Hours: 0,
      failuresLast24Hours: 0,
      averageLatencyMsLast24Hours: 0,
    }
  }

  return {
    requestsThisMonth: asNumber(data.requestsThisMonth),
    completedThisMonth: asNumber(data.completedThisMonth),
    failedThisMonth: asNumber(data.failedThisMonth),
    inputTokensThisMonth: asNumber(data.inputTokensThisMonth),
    outputTokensThisMonth: asNumber(data.outputTokensThisMonth),
    costMicrosThisMonth: asNumber(data.costMicrosThisMonth),
    organizationsUsingAIThisMonth: asNumber(data.organizationsUsingAIThisMonth),
    requestsLast24Hours: asNumber(data.requestsLast24Hours),
    failuresLast24Hours: asNumber(data.failuresLast24Hours),
    averageLatencyMsLast24Hours: asNumber(data.averageLatencyMsLast24Hours),
  }
}


export async function getPlatformAIDiagnostics(): Promise<PlatformAIDiagnostics> {
  await requirePlatformPermission('platform.ai.manage')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_ai_metrics')

  if (error) {
    throw new Error(`Unable to load platform AI diagnostics: ${error.message}`)
  }

  if (!isRecord(data)) {
    return {
      featureMetrics: [],
      modelMetrics: [],
      promptMetrics: [],
      providerMetrics: [],
    }
  }

  return {
    featureMetrics: parseDimensionMetrics(data.featureMetrics),
    modelMetrics: parseDimensionMetrics(data.modelMetrics),
    promptMetrics: parseDimensionMetrics(data.promptMetrics),
    providerMetrics: parseDimensionMetrics(data.providerMetrics),
  }
}

export async function getPlatformAIHealthChecks(
  limit = 40,
): Promise<PlatformAIHealthCheck[]> {
  await requirePlatformPermission('platform.ai.manage')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_ai_health_history', {
    p_limit: Math.min(Math.max(limit, 1), 100),
  })

  if (error) {
    throw new Error(`Unable to load AI provider health history: ${error.message}`)
  }

  const rows: unknown[] = Array.isArray(data) ? data : []
  return rows.flatMap((row) => {
    const parsed = parseHealthCheck(row)
    return parsed ? [parsed] : []
  })
}

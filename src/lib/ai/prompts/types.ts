import type { SupabaseClient } from '@supabase/supabase-js'

import type { AICapability } from '@/lib/ai/types'
import type { AIUsageFeature } from '@/lib/ai/usage/types'

export type AIPromptKey =
  | 'chat.general'
  | 'chat.sales'
  | 'chat.sdr'
  | 'chat.support'
  | 'chat.marketing'
  | 'call.analysis'
  | 'email.generate'
  | 'post_call.follow_up'
  | 'tasks.suggest'
  | 'summary.transcript'
  | 'sentiment.analyze'
  | 'coaching.call'
  | 'transcript.process'

export type AIPromptVariableValue = string | number | boolean | null | undefined
export type AIPromptVariables = Record<string, AIPromptVariableValue>

export type AIPromptDefinition = {
  key: AIPromptKey
  version: number
  capability: Extract<AICapability, 'text' | 'structured-output'>
  description: string
  systemTemplate: string
  userTemplate?: string
  requiredVariables: readonly string[]
  optionalVariables?: readonly string[]
  temperature: number
  responseSchema?: Record<string, unknown>
}

export type RenderedAIPrompt = {
  key: AIPromptKey
  version: number
  capability: AIPromptDefinition['capability']
  description: string
  system: string
  user: string | null
  temperature: number
  responseSchema: Record<string, unknown> | null
}

export type AIPromptExecutionMetadata = {
  promptKey: AIPromptKey
  promptVersion: number
  provider: string
  model: string
  requestId: string | null
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
}

export type AIPromptUsageContext = {
  supabase: SupabaseClient
  organizationId: string
  feature: AIUsageFeature
  idempotencyKey: string
  metadata?: Record<string, unknown>
}

export type PromptTextInput = {
  promptKey: AIPromptKey
  variables?: AIPromptVariables
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  usage?: AIPromptUsageContext
}

export type PromptStructuredInput = {
  promptKey: AIPromptKey
  variables: AIPromptVariables
  usage?: AIPromptUsageContext
}

import type { AICapability } from '@/lib/ai/types'

export type AIPromptKey =
  | 'chat.general'
  | 'chat.sales'
  | 'chat.sdr'
  | 'chat.support'
  | 'chat.marketing'
  | 'call.analysis'
  | 'email.generate'
  | 'tasks.suggest'
  | 'summary.transcript'
  | 'sentiment.analyze'
  | 'coaching.call'

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

export type PromptTextInput = {
  promptKey: AIPromptKey
  variables?: AIPromptVariables
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export type PromptStructuredInput = {
  promptKey: AIPromptKey
  variables: AIPromptVariables
}

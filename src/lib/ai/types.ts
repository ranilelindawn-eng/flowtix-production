export type AIProviderName = 'openai' | 'anthropic' | 'google' | 'openai-compatible'
export type AICapability = 'text' | 'structured-output' | 'transcription'
export type AIMessageRole = 'system' | 'user' | 'assistant'

export type AIMessage = { role: AIMessageRole; content: string }

export type AIProviderConfiguration = {
  provider: AIProviderName
  apiKey: string
  baseUrl: string
  textModel: string
  transcriptionModel?: string
  priority: number
  capabilities: AICapability[]
}

export type AITextRequest = {
  messages: AIMessage[]
  temperature?: number
  responseFormat?: { type: 'json_object' }
  timeoutMs?: number
}

export type AITextResult = {
  content: string
  provider: AIProviderName
  model: string
  requestId: string | null
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
}

export type AITranscriptionRequest = {
  file: File
  language?: string
  timeoutMs?: number
}

export type AITranscriptionResult = {
  text: string
  language: string | null
  provider: AIProviderName
  model: string
  requestId: string | null
  latencyMs: number
}

export interface AIProviderAdapter {
  readonly name: AIProviderName
  supports(capability: AICapability): boolean
  generateText(configuration: AIProviderConfiguration, request: AITextRequest): Promise<AITextResult>
  transcribe?(configuration: AIProviderConfiguration, request: AITranscriptionRequest): Promise<AITranscriptionResult>
}

export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AIConfigurationError'
  }
}

export class AIProviderError extends Error {
  readonly provider: AIProviderName
  readonly status: number | null
  readonly retryable: boolean
  readonly requestId: string | null

  constructor(input: {
    provider: AIProviderName
    message: string
    status?: number | null
    retryable?: boolean
    requestId?: string | null
  }) {
    super(input.message)
    this.name = 'AIProviderError'
    this.provider = input.provider
    this.status = input.status ?? null
    this.retryable = input.retryable ?? false
    this.requestId = input.requestId ?? null
  }
}

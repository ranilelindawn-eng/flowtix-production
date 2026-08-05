import type { AIProviderAdapter, AIProviderConfiguration, AITextRequest, AITextResult, AITranscriptionRequest, AITranscriptionResult } from './types'
import { AIProviderError } from './types'

type JsonRecord = Record<string, unknown>
function record(value: unknown): JsonRecord { return typeof value === 'object' && value !== null ? value as JsonRecord : {} }
function retryable(status: number): boolean { return status === 408 || status === 409 || status === 429 || status >= 500 }
async function parsed(response: Response): Promise<JsonRecord> { try { return record(await response.json()) } catch { return {} } }

class OpenAIAdapter implements AIProviderAdapter {
  readonly name: 'openai' | 'openai-compatible'
  constructor(name: 'openai' | 'openai-compatible') { this.name = name }
  supports(capability: 'text' | 'structured-output' | 'transcription'): boolean { return capability !== 'transcription' || true }
  async generateText(configuration: AIProviderConfiguration, request: AITextRequest): Promise<AITextResult> {
    const started = Date.now(); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? 60_000)
    try {
      const response = await fetch(`${configuration.baseUrl}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${configuration.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: configuration.textModel, messages: request.messages, temperature: request.temperature ?? 0.3, response_format: request.responseFormat }), cache: 'no-store', signal: controller.signal })
      const payload = await parsed(response); const requestId = response.headers.get('x-request-id')
      if (!response.ok) throw new AIProviderError({ provider: this.name, message: String(record(payload.error).message || `Request failed with status ${response.status}.`), status: response.status, retryable: retryable(response.status), requestId })
      const choices = Array.isArray(payload.choices) ? payload.choices : []; const content = String(record(record(choices[0]).message).content || '').trim()
      if (!content) throw new AIProviderError({ provider: this.name, message: 'Provider returned an empty response.', requestId })
      const usage = record(payload.usage)
      return { content, provider: this.name, model: configuration.textModel, requestId, inputTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null, outputTokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null, latencyMs: Date.now() - started }
    } catch (error) { if (error instanceof AIProviderError) throw error; if (error instanceof Error && error.name === 'AbortError') throw new AIProviderError({ provider: this.name, message: 'AI request timed out.', retryable: true }); throw new AIProviderError({ provider: this.name, message: error instanceof Error ? error.message : 'AI request failed.', retryable: true }) } finally { clearTimeout(timer) }
  }
  async transcribe(configuration: AIProviderConfiguration, request: AITranscriptionRequest): Promise<AITranscriptionResult> {
    if (!configuration.transcriptionModel) throw new AIProviderError({ provider: this.name, message: 'Transcription model is not configured.' })
    const started = Date.now(); const form = new FormData(); form.set('file', request.file); form.set('model', configuration.transcriptionModel); form.set('response_format', 'json'); if (request.language) form.set('language', request.language)
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? 120_000)
    try { const response = await fetch(`${configuration.baseUrl}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${configuration.apiKey}` }, body: form, signal: controller.signal }); const payload = await parsed(response); const requestId = response.headers.get('x-request-id'); if (!response.ok) throw new AIProviderError({ provider: this.name, message: String(record(payload.error).message || `Transcription failed with status ${response.status}.`), status: response.status, retryable: retryable(response.status), requestId }); return { text: String(payload.text || ''), language: typeof payload.language === 'string' ? payload.language : null, provider: this.name, model: configuration.transcriptionModel, requestId, latencyMs: Date.now() - started } } finally { clearTimeout(timer) }
  }
}

class AnthropicAdapter implements AIProviderAdapter {
  readonly name = 'anthropic' as const
  supports(capability: 'text' | 'structured-output' | 'transcription'): boolean { return capability !== 'transcription' }
  async generateText(configuration: AIProviderConfiguration, request: AITextRequest): Promise<AITextResult> {
    const started = Date.now(); const system = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n'); const messages = request.messages.filter((m) => m.role !== 'system')
    const response = await fetch(`${configuration.baseUrl}/messages`, { method: 'POST', headers: { 'x-api-key': configuration.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: configuration.textModel, max_tokens: 4096, temperature: request.temperature ?? 0.3, system, messages }), cache: 'no-store' }); const payload = await parsed(response); const requestId = response.headers.get('request-id')
    if (!response.ok) throw new AIProviderError({ provider: this.name, message: String(record(payload.error).message || `Request failed with status ${response.status}.`), status: response.status, retryable: retryable(response.status), requestId })
    const contentBlocks = Array.isArray(payload.content) ? payload.content : []; const content = contentBlocks.map((item) => String(record(item).text || '')).join('').trim(); if (!content) throw new AIProviderError({ provider: this.name, message: 'Provider returned an empty response.', requestId }); const usage = record(payload.usage)
    return { content, provider: this.name, model: configuration.textModel, requestId, inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : null, outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : null, latencyMs: Date.now() - started }
  }
}

class GoogleAdapter implements AIProviderAdapter {
  readonly name = 'google' as const
  supports(capability: 'text' | 'structured-output' | 'transcription'): boolean { return capability !== 'transcription' }
  async generateText(configuration: AIProviderConfiguration, request: AITextRequest): Promise<AITextResult> {
    const started = Date.now(); const systemInstruction = request.messages.filter((m) => m.role === 'system').map((m) => ({ text: m.content })); const contents = request.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    const response = await fetch(`${configuration.baseUrl}/models/${encodeURIComponent(configuration.textModel)}:generateContent?key=${encodeURIComponent(configuration.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: systemInstruction.length ? { parts: systemInstruction } : undefined, contents, generationConfig: { temperature: request.temperature ?? 0.3, responseMimeType: request.responseFormat ? 'application/json' : 'text/plain' } }), cache: 'no-store' }); const payload = await parsed(response); const requestId = response.headers.get('x-request-id')
    if (!response.ok) throw new AIProviderError({ provider: this.name, message: String(record(payload.error).message || `Request failed with status ${response.status}.`), status: response.status, retryable: retryable(response.status), requestId })
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : []; const parts = Array.isArray(record(record(candidates[0]).content).parts) ? record(record(candidates[0]).content).parts as unknown[] : []; const content = parts.map((item) => String(record(item).text || '')).join('').trim(); if (!content) throw new AIProviderError({ provider: this.name, message: 'Provider returned an empty response.', requestId }); const usage = record(payload.usageMetadata)
    return { content, provider: this.name, model: configuration.textModel, requestId, inputTokens: typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : null, outputTokens: typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : null, latencyMs: Date.now() - started }
  }
}

export const AI_PROVIDER_ADAPTERS: Record<string, AIProviderAdapter> = { openai: new OpenAIAdapter('openai'), 'openai-compatible': new OpenAIAdapter('openai-compatible'), anthropic: new AnthropicAdapter(), google: new GoogleAdapter() }

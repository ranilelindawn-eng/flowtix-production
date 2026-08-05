import { AI_PROVIDER_ADAPTERS } from './adapters'
import { requireAIProviderConfigurations } from './config'
import type { AICapability, AITextRequest, AITextResult, AITranscriptionRequest, AITranscriptionResult } from './types'
import { AIProviderError } from './types'

async function executeWithFallback<T>(capability: AICapability, execute: (configuration: ReturnType<typeof requireAIProviderConfigurations>[number]) => Promise<T>): Promise<T> {
  const configurations = requireAIProviderConfigurations(capability); const failures: string[] = []
  for (const configuration of configurations) {
    const adapter = AI_PROVIDER_ADAPTERS[configuration.provider]
    if (!adapter?.supports(capability)) continue
    try { return await execute(configuration) } catch (error) { failures.push(`${configuration.provider}: ${error instanceof Error ? error.message : 'unknown error'}`); if (!(error instanceof AIProviderError) || !error.retryable) throw error }
  }
  throw new AIProviderError({ provider: configurations[0].provider, message: `All configured AI providers failed. ${failures.join(' | ')}`, retryable: true })
}

export async function generateAIText(request: AITextRequest): Promise<AITextResult> {
  const capability: AICapability = request.responseFormat ? 'structured-output' : 'text'
  return executeWithFallback(capability, (configuration) => AI_PROVIDER_ADAPTERS[configuration.provider].generateText(configuration, request))
}

export async function transcribeAI(request: AITranscriptionRequest): Promise<AITranscriptionResult> {
  return executeWithFallback('transcription', (configuration) => {
    const transcribe = AI_PROVIDER_ADAPTERS[configuration.provider].transcribe
    if (!transcribe) throw new AIProviderError({ provider: configuration.provider, message: 'Provider does not support transcription.' })
    return transcribe.call(AI_PROVIDER_ADAPTERS[configuration.provider], configuration, request)
  })
}

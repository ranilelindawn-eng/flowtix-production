import { AIConfigurationError, type AICapability, type AIProviderConfiguration, type AIProviderName } from './types'

function normalizeBaseUrl(value: string, fallback: string): string {
  return (value.trim() || fallback).replace(/\/$/, '')
}

function providerOrder(): AIProviderName[] {
  const allowed = new Set<AIProviderName>(['openai', 'anthropic', 'google', 'openai-compatible'])
  const requested = (process.env.AI_PROVIDER_ORDER || 'openai,anthropic,google,openai-compatible')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is AIProviderName => allowed.has(value as AIProviderName))
  return [...new Set(requested)]
}

export function getAIProviderConfigurations(): AIProviderConfiguration[] {
  const configurations: Partial<Record<AIProviderName, AIProviderConfiguration>> = {}
  const openAIKey = process.env.OPENAI_API_KEY?.trim()
  if (openAIKey) {
    configurations.openai = {
      provider: 'openai', apiKey: openAIKey,
      baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL || '', 'https://api.openai.com/v1'),
      textModel: process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
      transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || 'gpt-4o-mini-transcribe',
      priority: 0, capabilities: ['text', 'structured-output', 'transcription'],
    }
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (anthropicKey) {
    configurations.anthropic = {
      provider: 'anthropic', apiKey: anthropicKey,
      baseUrl: normalizeBaseUrl(process.env.ANTHROPIC_BASE_URL || '', 'https://api.anthropic.com/v1'),
      textModel: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5',
      priority: 0, capabilities: ['text', 'structured-output'],
    }
  }
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()
  if (googleKey) {
    configurations.google = {
      provider: 'google', apiKey: googleKey,
      baseUrl: normalizeBaseUrl(process.env.GOOGLE_GENERATIVE_AI_BASE_URL || '', 'https://generativelanguage.googleapis.com/v1beta'),
      textModel: process.env.GOOGLE_GENERATIVE_AI_MODEL?.trim() || 'gemini-2.5-flash',
      priority: 0, capabilities: ['text', 'structured-output'],
    }
  }
  const compatibleKey = process.env.AI_COMPATIBLE_API_KEY?.trim()
  if (compatibleKey) {
    configurations['openai-compatible'] = {
      provider: 'openai-compatible', apiKey: compatibleKey,
      baseUrl: normalizeBaseUrl(process.env.AI_COMPATIBLE_BASE_URL || '', ''),
      textModel: process.env.AI_COMPATIBLE_MODEL?.trim() || '',
      transcriptionModel: process.env.AI_COMPATIBLE_TRANSCRIPTION_MODEL?.trim() || undefined,
      priority: 0,
      capabilities: process.env.AI_COMPATIBLE_TRANSCRIPTION_MODEL ? ['text', 'structured-output', 'transcription'] : ['text', 'structured-output'],
    }
  }

  return providerOrder().flatMap((provider, priority) => {
    const value = configurations[provider]
    return value ? [{ ...value, priority }] : []
  })
}

export function requireAIProviderConfigurations(capability: AICapability): AIProviderConfiguration[] {
  const configured = getAIProviderConfigurations().filter((provider) => provider.capabilities.includes(capability))
  if (configured.length === 0) {
    throw new AIConfigurationError(`AI capability "${capability}" is not configured. Add credentials for a supported provider.`)
  }
  return configured
}

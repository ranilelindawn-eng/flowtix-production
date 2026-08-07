import { generateAIText } from '@/lib/ai/service'
import {
  completeAIUsage,
  failAIUsage,
  reserveAIUsage,
} from '@/lib/ai/usage/service'

import { renderAIPrompt } from './renderer'
import type {
  AIPromptExecutionMetadata,
  PromptStructuredInput,
  PromptTextInput,
} from './types'

function extractJson(value: string): unknown {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? value).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')

  if (start < 0 || end <= start) {
    throw new Error('The AI provider returned a response that did not contain valid JSON.')
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    throw new Error('The AI provider returned malformed JSON. Please try again.')
  }
}


function estimateTokens(value: string): number {
  if (!value) return 0
  return Math.max(1, Math.ceil(value.length / 4))
}

async function executeTrackedPrompt<T>(
  input: {
    usage?: PromptTextInput['usage']
    estimatedInputTokens: number
    execute: () => Promise<{
      result: T
      metadata: AIPromptExecutionMetadata
    }>
  },
): Promise<{
  result: T
  metadata: AIPromptExecutionMetadata
}> {
  const usage = input.usage

  if (!usage) {
    return input.execute()
  }

  const reservation = await reserveAIUsage(usage.supabase, {
    organizationId: usage.organizationId,
    feature: usage.feature,
    idempotencyKey: usage.idempotencyKey,
    estimatedInputTokens: input.estimatedInputTokens,
  })

  if (reservation.status === 'completed') {
    throw new Error(
      'This AI request has already been completed. Please refresh before retrying.',
    )
  }

  try {
    const execution = await input.execute()

    await completeAIUsage(usage.supabase, reservation.id, {
      provider: execution.metadata.provider,
      model: execution.metadata.model,
      inputTokens: execution.metadata.inputTokens,
      outputTokens: execution.metadata.outputTokens,
      requestId: execution.metadata.requestId,
      latencyMs: execution.metadata.latencyMs,
      costMicros: null,
      metadata: {
        promptKey: execution.metadata.promptKey,
        promptVersion: execution.metadata.promptVersion,
        costCalculated: false,
        ...(usage.metadata ?? {}),
      },
    })

    return execution
  } catch (error) {
    await failAIUsage(usage.supabase, reservation.id, error)
    throw error
  }
}

export async function generatePromptText(
  input: PromptTextInput,
): Promise<{ content: string; metadata: AIPromptExecutionMetadata }> {
  const prompt = renderAIPrompt(input.promptKey, input.variables)
  if (prompt.capability !== 'text') {
    throw new Error(`AI prompt "${input.promptKey}" is not a text prompt.`)
  }

  const messages = [
    { role: 'system' as const, content: prompt.system },
    ...(prompt.user ? [{ role: 'user' as const, content: prompt.user }] : []),
    ...input.messages,
  ]

  const execution = await executeTrackedPrompt({
    usage: input.usage,
    estimatedInputTokens: estimateTokens(
      messages.map((message) => message.content).join('\n'),
    ),
    execute: async () => {
      const result = await generateAIText({
        temperature: prompt.temperature,
        messages,
      })

      const metadata: AIPromptExecutionMetadata = {
        promptKey: prompt.key,
        promptVersion: prompt.version,
        provider: result.provider,
        model: result.model,
        requestId: result.requestId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
      }

      return {
        result: result.content,
        metadata,
      }
    },
  })

  return {
    content: execution.result,
    metadata: execution.metadata,
  }
}

export async function generatePromptStructured<T>(
  input: PromptStructuredInput,
): Promise<{ value: T; metadata: AIPromptExecutionMetadata }> {
  const prompt = renderAIPrompt(input.promptKey, input.variables)
  if (
    prompt.capability !== 'structured-output' ||
    !prompt.user ||
    !prompt.responseSchema
  ) {
    throw new Error(
      `AI prompt "${input.promptKey}" is not a structured-output prompt.`,
    )
  }

  const system = `${prompt.system}\nReturn only valid JSON matching this structure: ${JSON.stringify(prompt.responseSchema)}`
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: prompt.user },
  ]

  const execution = await executeTrackedPrompt({
    usage: input.usage,
    estimatedInputTokens: estimateTokens(
      messages.map((message) => message.content).join('\n'),
    ),
    execute: async () => {
      const result = await generateAIText({
        temperature: prompt.temperature,
        responseFormat: { type: 'json_object' },
        messages,
      })

      const metadata: AIPromptExecutionMetadata = {
        promptKey: prompt.key,
        promptVersion: prompt.version,
        provider: result.provider,
        model: result.model,
        requestId: result.requestId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
      }

      return {
        result: extractJson(result.content) as T,
        metadata,
      }
    },
  })

  return {
    value: execution.result,
    metadata: execution.metadata,
  }
}


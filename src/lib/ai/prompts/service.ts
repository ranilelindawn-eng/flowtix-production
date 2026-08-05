import { generateAIText } from '@/lib/ai/service'

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

export async function generatePromptText(
  input: PromptTextInput,
): Promise<{ content: string; metadata: AIPromptExecutionMetadata }> {
  const prompt = renderAIPrompt(input.promptKey, input.variables)
  if (prompt.capability !== 'text') {
    throw new Error(`AI prompt "${input.promptKey}" is not a text prompt.`)
  }

  const result = await generateAIText({
    temperature: prompt.temperature,
    messages: [
      { role: 'system', content: prompt.system },
      ...(prompt.user ? [{ role: 'user' as const, content: prompt.user }] : []),
      ...input.messages,
    ],
  })

  return {
    content: result.content,
    metadata: { promptKey: prompt.key, promptVersion: prompt.version },
  }
}

export async function generatePromptStructured<T>(
  input: PromptStructuredInput,
): Promise<{ value: T; metadata: AIPromptExecutionMetadata }> {
  const prompt = renderAIPrompt(input.promptKey, input.variables)
  if (prompt.capability !== 'structured-output' || !prompt.user || !prompt.responseSchema) {
    throw new Error(`AI prompt "${input.promptKey}" is not a structured-output prompt.`)
  }

  const result = await generateAIText({
    temperature: prompt.temperature,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `${prompt.system}\nReturn only valid JSON matching this structure: ${JSON.stringify(prompt.responseSchema)}`,
      },
      { role: 'user', content: prompt.user },
    ],
  })

  return {
    value: extractJson(result.content) as T,
    metadata: { promptKey: prompt.key, promptVersion: prompt.version },
  }
}

import { getAIProviderConfigurations } from './config'
import { generateAIText } from './service'
import { AIConfigurationError } from './types'

export type AIAnalysis = {
  summary: string
  followUp: string
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'
  sentimentScore: number
  callScore: number
  objections: Array<{ objection: string; response: string }>
  actionItems: string[]
  keywords: string[]
  coaching: string[]
  nextBestAction: string
}

export type AIChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type JsonSchema = Record<string, unknown>

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

export { AIConfigurationError }

export function getAIProviderLabel(): string {
  const configuration = getAIProviderConfigurations()[0]
  return configuration ? `${configuration.provider}:${configuration.textModel}` : 'not-configured'
}

export async function generateTextAI(input: {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<string> {
  const result = await generateAIText({
    temperature: 0.35,
    messages: [{ role: 'system', content: input.system }, ...input.messages],
  })
  return result.content
}

export async function generateStructuredAI<T>(input: {
  system: string
  prompt: string
  schemaDescription: JsonSchema
}): Promise<T> {
  const result = await generateAIText({
    temperature: 0.2,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `${input.system}\nReturn only valid JSON matching this structure: ${JSON.stringify(input.schemaDescription)}`,
      },
      { role: 'user', content: input.prompt },
    ],
  })

  return extractJson(result.content) as T
}

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

type JsonSchema = Record<string, unknown>

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
  error?: {
    message?: string
  }
}

export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AIConfigurationError'
  }
}

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

export function getAIProviderLabel(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini'
}

export async function generateStructuredAI<T>(input: {
  system: string
  prompt: string
  schemaDescription: JsonSchema
}): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()

  if (!apiKey) {
    throw new AIConfigurationError(
      'AI is not configured. Add OPENAI_API_KEY to your environment variables before using the AI Workspace.',
    )
  }

  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = getAIProviderLabel()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${input.system}\nReturn only valid JSON matching this structure: ${JSON.stringify(input.schemaDescription)}`,
          },
          { role: 'user', content: input.prompt },
        ],
      }),
      cache: 'no-store',
      signal: controller.signal,
    })

    const rawBody = await response.text()
    let payload: ChatCompletionResponse = {}

    try {
      payload = rawBody ? (JSON.parse(rawBody) as ChatCompletionResponse) : {}
    } catch {
      payload = {}
    }

    if (!response.ok) {
      const providerMessage = payload.error?.message?.trim()
      throw new Error(
        providerMessage
          ? `AI provider request failed: ${providerMessage}`
          : `AI provider request failed with status ${response.status}.`,
      )
    }

    const content = payload.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error('The AI provider returned an empty response.')
    }

    return extractJson(content) as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The AI request timed out. Please try again with a shorter input.')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

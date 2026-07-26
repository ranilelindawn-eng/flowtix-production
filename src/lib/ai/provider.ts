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

function extractJson(value: string): unknown {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] ?? value
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('The AI provider returned invalid JSON.')
  return JSON.parse(candidate.slice(start, end + 1))
}

export async function generateStructuredAI<T>(input: {
  system: string
  prompt: string
  schemaDescription: JsonSchema
}): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')

  const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: `${input.system}\nReturn only valid JSON matching this structure: ${JSON.stringify(input.schemaDescription)}` },
        { role: 'user', content: input.prompt },
      ],
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`AI provider request failed (${response.status}): ${body.slice(0, 300)}`)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('The AI provider returned an empty response.')
  return extractJson(content) as T
}

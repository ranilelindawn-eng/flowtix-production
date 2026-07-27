import type { AIAnalysis } from '@/lib/ai/provider'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string, maxLength = 10_000): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`The AI response is missing ${field}.`)
  }

  return value.trim().slice(0, maxLength)
}

function stringArray(value: unknown, maxItems: number, maxLength = 500): string[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLength))
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function validateAIAnalysis(value: unknown): AIAnalysis {
  if (!isRecord(value)) {
    throw new Error('The AI provider returned an invalid analysis.')
  }

  const allowedSentiments = ['positive', 'neutral', 'negative', 'mixed'] as const
  const sentiment = allowedSentiments.includes(value.sentiment as (typeof allowedSentiments)[number])
    ? (value.sentiment as AIAnalysis['sentiment'])
    : 'neutral'

  const objections = Array.isArray(value.objections)
    ? value.objections
        .filter(isRecord)
        .slice(0, 10)
        .map((item) => ({
          objection: requiredString(item.objection, 'an objection', 500),
          response: requiredString(item.response, 'an objection response', 1_000),
        }))
    : []

  return {
    summary: requiredString(value.summary, 'a summary'),
    followUp: requiredString(value.followUp, 'a follow-up message'),
    sentiment,
    sentimentScore: Math.max(-1, Math.min(1, finiteNumber(value.sentimentScore, 0))),
    callScore: Math.round(Math.max(0, Math.min(100, finiteNumber(value.callScore, 0)))),
    objections,
    actionItems: stringArray(value.actionItems, 12),
    keywords: stringArray(value.keywords, 20, 100),
    coaching: stringArray(value.coaching, 12),
    nextBestAction: requiredString(value.nextBestAction, 'a next-best action', 2_000),
  }
}

export type GeneratedEmail = {
  subject: string
  body: string
}

export function validateGeneratedEmail(value: unknown): GeneratedEmail {
  if (!isRecord(value)) {
    throw new Error('The AI provider returned an invalid email.')
  }

  return {
    subject: requiredString(value.subject, 'an email subject', 250),
    body: requiredString(value.body, 'an email body', 15_000),
  }
}

export type SuggestedTask = {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  dueInDays: number
}

export function validateSuggestedTasks(value: unknown): SuggestedTask[] {
  if (!isRecord(value) || !Array.isArray(value.tasks)) {
    throw new Error('The AI provider returned an invalid task list.')
  }

  return value.tasks
    .filter(isRecord)
    .slice(0, 8)
    .map((task) => {
      const priority = ['low', 'medium', 'high'].includes(String(task.priority))
        ? (task.priority as SuggestedTask['priority'])
        : 'medium'
      const dueInDays = Math.round(Math.max(0, Math.min(30, finiteNumber(task.dueInDays, 1))))

      return {
        title: requiredString(task.title, 'a task title', 250),
        description: requiredString(task.description, 'a task description', 2_000),
        priority,
        dueInDays,
      }
    })
}

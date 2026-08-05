import { getAIPromptDefinition } from './registry'
import type { AIPromptKey, AIPromptVariables, RenderedAIPrompt } from './types'

const VARIABLE_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g

function normalizeValue(value: AIPromptVariables[string]): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\u0000/g, '').trim()
}

function renderTemplate(template: string, variables: AIPromptVariables): string {
  return template.replace(VARIABLE_PATTERN, (_match, variable: string) => normalizeValue(variables[variable]))
}

export function renderAIPrompt(key: AIPromptKey, variables: AIPromptVariables = {}): RenderedAIPrompt {
  const prompt = getAIPromptDefinition(key)
  const missing = prompt.requiredVariables.filter((variable) => normalizeValue(variables[variable]).length === 0)

  if (missing.length > 0) {
    throw new Error(`AI prompt "${key}" is missing required variables: ${missing.join(', ')}.`)
  }

  const allowed = new Set([...(prompt.requiredVariables ?? []), ...(prompt.optionalVariables ?? [])])
  const unexpected = Object.keys(variables).filter((variable) => !allowed.has(variable))
  if (unexpected.length > 0) {
    throw new Error(`AI prompt "${key}" received unsupported variables: ${unexpected.join(', ')}.`)
  }

  const system = renderTemplate(prompt.systemTemplate, variables).trim()
  const user = prompt.userTemplate ? renderTemplate(prompt.userTemplate, variables).trim() : null

  const hasUnresolvedSystemVariable = /{{\s*[a-zA-Z0-9_.-]+\s*}}/.test(system)
  const hasUnresolvedUserVariable = user ? /{{\s*[a-zA-Z0-9_.-]+\s*}}/.test(user) : false
  if (hasUnresolvedSystemVariable || hasUnresolvedUserVariable) {
    throw new Error(`AI prompt "${key}" contains unresolved template variables.`)
  }

  return {
    key: prompt.key,
    version: prompt.version,
    capability: prompt.capability,
    description: prompt.description,
    system,
    user,
    temperature: prompt.temperature,
    responseSchema: prompt.responseSchema ?? null,
  }
}

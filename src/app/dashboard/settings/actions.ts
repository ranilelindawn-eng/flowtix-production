'use server'

import { revalidatePath } from 'next/cache'

import { updateOrganizationSettings } from '@/lib/organization-settings'

const VALID_AI_PROVIDERS = [
  'manual',
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'other',
] as const

type AIProvider = (typeof VALID_AI_PROVIDERS)[number]

function getString(
  formData: FormData,
  key: string
): string {
  return String(formData.get(key) ?? '').trim()
}

function getBoolean(
  formData: FormData,
  key: string
): boolean {
  return formData.get(key) === 'on'
}

function getAIProvider(
  value: string
): AIProvider {
  if (
    VALID_AI_PROVIDERS.includes(
      value as AIProvider
    )
  ) {
    return value as AIProvider
  }

  return 'manual'
}

export async function saveOrganizationSettings(
  formData: FormData
) {
  const name = getString(formData, 'name')
  const logo_url = getString(formData, 'logo_url')
  const timezone = getString(formData, 'timezone')
  const transcription_language = getString(
    formData,
    'transcription_language'
  )
  const ai_provider = getAIProvider(
    getString(formData, 'ai_provider')
  )
  const ai_model = getString(
    formData,
    'ai_model'
  )

  if (!name) {
    throw new Error(
      'Organization name is required.'
    )
  }

  if (!timezone) {
    throw new Error(
      'Timezone is required.'
    )
  }

  if (!transcription_language) {
    throw new Error(
      'Transcription language is required.'
    )
  }

  await updateOrganizationSettings({
    name,
    logo_url: logo_url || null,
    timezone,
    recording_enabled: getBoolean(
      formData,
      'recording_enabled'
    ),
    transcription_enabled: getBoolean(
      formData,
      'transcription_enabled'
    ),
    transcription_language,
    ai_provider,
    ai_model: ai_model || null,
  })

  revalidatePath('/dashboard/settings')
}
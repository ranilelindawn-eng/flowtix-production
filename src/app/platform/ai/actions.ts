'use server'

import { revalidatePath } from 'next/cache'

import { AI_PROVIDER_ADAPTERS } from '@/lib/ai/adapters'
import { getAIProviderConfigurations } from '@/lib/ai/config'
import type { AIProviderName } from '@/lib/ai/types'
import { requirePlatformPermission } from '@/lib/platform/auth'
import { sanitizeProviderMessage } from '@/lib/platform/provider-security'
import { createClient } from '@/lib/supabase/server'

type PlatformAIActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

const providerNames: AIProviderName[] = [
  'openai',
  'anthropic',
  'google',
  'openai-compatible',
]

function formString(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function isProvider(value: string): value is AIProviderName {
  return providerNames.includes(value as AIProviderName)
}

async function recordHealth(input: {
  provider: AIProviderName
  success: boolean
  model: string | null
  latencyMs: number | null
  message: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('platform_record_ai_health_check', {
    p_provider: input.provider,
    p_success: input.success,
    p_model: input.model,
    p_latency_ms: input.latencyMs,
    p_message: input.message,
  })

  if (error) {
    throw new Error(`Unable to record AI provider health: ${error.message}`)
  }
}

export async function verifyPlatformAIProvider(
  _previousState: PlatformAIActionState,
  formData: FormData,
): Promise<PlatformAIActionState> {
  await requirePlatformPermission('platform.ai.manage')

  const providerValue = formString(formData, 'provider')
  if (!isProvider(providerValue)) {
    return { status: 'error', message: 'Unsupported AI provider.' }
  }

  const configuration = getAIProviderConfigurations().find(
    (item) => item.provider === providerValue,
  )

  if (!configuration) {
    return {
      status: 'error',
      message: `${providerValue} is not configured in the Flowtix server environment.`,
    }
  }

  const adapter = AI_PROVIDER_ADAPTERS[providerValue]
  if (!adapter?.supports('text')) {
    return {
      status: 'error',
      message: `${providerValue} does not support text generation.`,
    }
  }

  try {
    const result = await adapter.generateText(configuration, {
      messages: [
        {
          role: 'system',
          content: 'You are a provider health probe. Respond with exactly OK.',
        },
        { role: 'user', content: 'Health check' },
      ],
      temperature: 0,
      timeoutMs: 20_000,
    })

    const message = `${providerValue} verified successfully with ${result.model}.`

    await recordHealth({
      provider: providerValue,
      success: true,
      model: result.model,
      latencyMs: result.latencyMs,
      message,
    })

    revalidatePath('/platform')
    revalidatePath('/platform/ai')

    return { status: 'success', message }
  } catch (error) {
    const message = sanitizeProviderMessage(
      error,
      'Provider health check failed.',
    )

    try {
      await recordHealth({
        provider: providerValue,
        success: false,
        model: configuration.textModel || null,
        latencyMs: null,
        message,
      })
    } catch {
      // Preserve the provider failure as the user-facing error.
    }

    revalidatePath('/platform/ai')

    return {
      status: 'error',
      message: `${providerValue} verification failed: ${message}`,
    }
  }
}

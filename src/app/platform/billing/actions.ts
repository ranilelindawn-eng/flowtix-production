'use server'

import { revalidatePath } from 'next/cache'

import {
  processPayMongoWebhookBody,
  type PayMongoWebhookBody,
} from '@/lib/billing/paymongo-webhook'
import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type Row = Record<string, unknown>

type PlatformBillingActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}


const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function getFormString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

async function recordReplayResult(
  eventId: string,
  success: boolean,
  errorMessage: string | null,
) {
  const supabase = await createClient()
  await supabase.rpc('platform_record_billing_replay_result', {
    p_event_id: eventId,
    p_success: success,
    p_error_message: errorMessage,
  })
}

export async function replayPlatformPayMongoEvent(
  _previousState: PlatformBillingActionState,
  formData: FormData,
): Promise<PlatformBillingActionState> {
  await requirePlatformPermission('platform.billing.manage')

  const eventId = getFormString(formData, 'eventId')
  const reason = getFormString(formData, 'reason')

  if (!eventId) {
    return { status: 'error', message: 'Billing event ID is required.' }
  }

  if (reason.length < 10) {
    return {
      status: 'error',
      message: 'Enter a reason of at least 10 characters for webhook replay.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_prepare_billing_webhook_replay',
    {
      p_event_id: eventId,
      p_reason: reason,
    },
  )

  if (error) {
    return {
      status: 'error',
      message: `Unable to prepare webhook replay: ${error.message}`,
    }
  }

  if (!isRecord(data) || !isRecord(data.payload)) {
    return {
      status: 'error',
      message: 'Stored PayMongo webhook payload is unavailable.',
    }
  }

  const signatureTimestamp =
    typeof data.signatureTimestamp === 'string'
      ? data.signatureTimestamp
      : new Date().toISOString()

  try {
    await processPayMongoWebhookBody(
      data.payload as PayMongoWebhookBody,
      signatureTimestamp,
    )

    await recordReplayResult(eventId, true, null)

    revalidatePath('/platform')
    revalidatePath('/platform/billing')
    revalidatePath(`/platform/billing/events/${eventId}`)
    revalidatePath('/platform/subscriptions')
    revalidatePath('/platform/customers')

    return {
      status: 'success',
      message:
        'PayMongo webhook replay completed through the existing lifecycle processor.',
    }
  } catch (processingError) {
    const message =
      processingError instanceof Error
        ? processingError.message
        : 'Unknown PayMongo replay error.'

    await recordReplayResult(eventId, false, message)

    return {
      status: 'error',
      message: `Webhook replay failed: ${message}`,
    }
  }
}

import { NextResponse } from 'next/server'

import {
  processPayMongoWebhookBody,
  type PayMongoWebhookBody,
} from '@/lib/billing/paymongo-webhook'
import { writeAuditEvent } from '@/lib/security/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentOrganization } from '@/lib/team'

export const runtime = 'nodejs'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

export async function POST(request: Request) {
  const organization = await getCurrentOrganization()
  if (!organization) {
    return noStoreJson({ error: 'Authentication required.' }, 401)
  }
  if (organization.role !== 'owner' && organization.role !== 'admin') {
    return noStoreJson({ error: 'Owner or admin permission required.' }, 403)
  }

  let eventId: string | null = null
  try {
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as { eventId?: unknown }
      eventId = typeof body.eventId === 'string' ? body.eventId.trim() : null
    } else {
      const form = await request.formData()
      eventId = form.get('eventId')?.toString().trim() ?? null
    }
  } catch {
    return noStoreJson({ error: 'Invalid replay request.' }, 400)
  }

  if (!eventId || !UUID_PATTERN.test(eventId)) {
    return noStoreJson({ error: 'A valid billing event ID is required.' }, 400)
  }

  const admin = createAdminClient()
  const { data: replay, error: replayError } = await admin.rpc(
    'replay_billing_webhook_event',
    {
      p_event_uuid: eventId,
      p_actor_user_id: organization.user_id,
    },
  )

  if (replayError) {
    return noStoreJson({ error: replayError.message }, 400)
  }

  const payload = replay?.payload
  const providerEventId =
    typeof replay?.provider_event_id === 'string' ? replay.provider_event_id : null
  const signatureTimestamp =
    typeof replay?.signature_timestamp === 'string'
      ? replay.signature_timestamp
      : new Date().toISOString()

  if (!payload || typeof payload !== 'object' || !providerEventId) {
    return noStoreJson({ error: 'Stored billing event payload is incomplete.' }, 409)
  }

  try {
    const processed = await processPayMongoWebhookBody(
      payload as PayMongoWebhookBody,
      signatureTimestamp,
    )

    await writeAuditEvent({
      action: 'billing.paymongo.webhook.replayed',
      organizationId: organization.organization_id,
      resourceType: 'billing_payment_event',
      resourceId: eventId,
      metadata: { provider_event_id: providerEventId },
    })

    return noStoreJson({ replayed: true, ...processed })
  } catch (error) {
    return noStoreJson(
      {
        error:
          error instanceof Error ? error.message : 'Webhook replay failed.',
      },
      500,
    )
  }
}

import { NextResponse } from 'next/server'

import {
  enqueueCanonicalPostCallDispatch,
  evaluateCanonicalPostCallTrigger,
} from '@/lib/automation/post-call/trigger'
import { hasPermission } from '@/lib/permissions'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { isTelephonyProvider, type TelephonyCallStatus } from '@/lib/telephony/provider'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

const BROWSER_PROVIDERS = new Set(['signalwire'])
const ALLOWED_STATUSES = new Set<TelephonyCallStatus>([
  'initiating',
  'ringing',
  'connected',
  'on-hold',
  'completed',
  'failed',
  'cancelled',
])
const TERMINAL = new Set<TelephonyCallStatus>(['completed', 'failed', 'cancelled'])

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    const userId = data?.claims?.sub
    const organization = await getCurrentOrganization()

    if (typeof userId !== 'string' || !organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!hasPermission(organization.role, 'calls.view')) {
      return NextResponse.json({ error: 'You do not have permission to update call state.' }, { status: 403 })
    }

    const payload = (await request.json()) as Record<string, unknown>
    const provider = text(payload.provider)
    const providerCallId = text(payload.providerCallId)
    const status = text(payload.status) as TelephonyCallStatus
    const rawStatus = text(payload.rawStatus) || status

    if (
      !isTelephonyProvider(provider) ||
      !BROWSER_PROVIDERS.has(provider) ||
      !providerCallId ||
      providerCallId.length > 160 ||
      !ALLOWED_STATUSES.has(status)
    ) {
      return NextResponse.json({ error: 'Invalid browser call status update.' }, { status: 400 })
    }

    const admin = createTelephonyAdminClient()
    const { data: matchingCalls, error: lookupError } = await admin
      .from('calls')
      .select('id,status')
      .eq('organization_id', organization.organization_id)
      .eq('provider', provider)
      .or(`provider_call_sid.eq.${providerCallId},provider_child_call_sid.eq.${providerCallId}`)
      .limit(2)

    if (lookupError) throw new Error(lookupError.message)
    const call = matchingCalls?.[0]
    if (!call) return NextResponse.json({ ok: true, ignored: true })

    const currentStatus = call.status as TelephonyCallStatus
    if (TERMINAL.has(currentStatus) && !TERMINAL.has(status)) {
      return NextResponse.json({ ok: true, ignored: true, callId: call.id })
    }

    const now = new Date().toISOString()
    const update: Record<string, unknown> = {
      status,
      provider_status_raw: rawStatus,
      provider_event_at: now,
      updated_at: now,
    }
    if (TERMINAL.has(status)) update.ended_at = now

    const { error: updateError } = await admin
      .from('calls')
      .update(update)
      .eq('id', call.id)
      .eq('organization_id', organization.organization_id)

    if (updateError) throw new Error(updateError.message)

    if (TERMINAL.has(status)) {
      try {
        const trigger = await evaluateCanonicalPostCallTrigger({
          organizationId: organization.organization_id,
          callId: call.id,
          previousStatus: currentStatus,
          status,
          occurredAt: now,
        })

        if (trigger.eligible) {
          const job = await enqueueCanonicalPostCallDispatch(trigger)

          console.info('Canonical post-call automation job queued from browser call status.', {
            organizationId: trigger.organizationId,
            callId: trigger.callId,
            status: trigger.status,
            emailEnabled: trigger.emailEnabled,
            smsEnabled: trigger.smsEnabled,
            delaySeconds: trigger.delaySeconds,
            jobId: job?.id ?? null,
            jobStatus: job?.status ?? null,
            scheduledAt: job?.scheduled_at ?? null,
          })
        }
      } catch (triggerError) {
        // A post-call automation evaluation failure must never roll back or
        // invalidate an otherwise valid browser call lifecycle update.
        console.error(
          'Unable to evaluate canonical post-call automation trigger from browser call status:',
          triggerError,
        )
      }
    }

    return NextResponse.json({ ok: true, callId: call.id })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update browser call state.' },
      { status: 500 },
    )
  }
}

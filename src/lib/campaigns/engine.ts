import { createClient } from '@supabase/supabase-js'

import { assertAutomationEnabled, isAutomationPaused } from '@/lib/automation/operations'
import { enforceAutomationRules } from '@/lib/compliance/automation-rules'
import {
  NonRetryableJobError,
  type JsonValue,
} from '@/lib/jobs/types'

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service-role configuration for campaign execution.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function asObject(value: JsonValue): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NonRetryableJobError(
      'The campaign job payload is invalid.',
      'INVALID_CAMPAIGN_PAYLOAD',
    )
  }

  return value as Record<string, JsonValue>
}

function requiredString(
  value: JsonValue | undefined,
  label: string,
): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new NonRetryableJobError(
      `${label} is required.`,
      'INVALID_CAMPAIGN_PAYLOAD',
    )
  }

  return value.trim()
}

function isE164(value: string | null): value is string {
  return typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value)
}

export async function executeCampaignMember(
  payloadValue: JsonValue,
): Promise<Record<string, JsonValue>> {
  const payload = asObject(payloadValue)
  const campaignId = requiredString(
    payload.campaignId,
    'Campaign ID',
  )
  const campaignMemberId = requiredString(
    payload.campaignMemberId,
    'Campaign member ID',
  )
  const contactId = requiredString(
    payload.contactId,
    'Contact ID',
  )
  const attemptId = requiredString(
    payload.attemptId,
    'Attempt ID',
  )
  const reservationToken = requiredString(
    payload.reservationToken,
    'Reservation token',
  )

  const client = createServiceClient()
  const { data: member, error: memberError } = await client
    .from('campaign_members')
    .select(
      'id,organization_id,campaign_id,contact_id,status,reservation_token,reservation_expires_at,processing_job_id,current_attempt_id,owner_membership_id',
    )
    .eq('id', campaignMemberId)
    .maybeSingle()

  if (memberError) {
    throw new Error(memberError.message)
  }

  if (!member) {
    throw new NonRetryableJobError(
      'The campaign member no longer exists.',
      'CAMPAIGN_MEMBER_NOT_FOUND',
    )
  }

  await assertAutomationEnabled(member.organization_id, 'campaigns')

  if (
    member.campaign_id !== campaignId ||
    member.contact_id !== contactId ||
    member.current_attempt_id !== attemptId ||
    member.reservation_token !== reservationToken
  ) {
    throw new NonRetryableJobError(
      'The campaign member reservation is stale.',
      'STALE_CAMPAIGN_RESERVATION',
    )
  }

  if (member.status !== 'calling') {
    return {
      skipped: true,
      reason: `Campaign member is ${member.status}.`,
    }
  }

  if (
    member.reservation_expires_at &&
    new Date(member.reservation_expires_at).getTime() <= Date.now()
  ) {
    throw new NonRetryableJobError(
      'The campaign member reservation expired.',
      'CAMPAIGN_RESERVATION_EXPIRED',
    )
  }

  const { data: attempt, error: attemptError } = await client
    .from('campaign_member_attempts')
    .select('id,status,call_id')
    .eq('id', attemptId)
    .eq('campaign_member_id', member.id)
    .maybeSingle()

  if (attemptError) {
    throw new Error(attemptError.message)
  }

  if (!attempt) {
    throw new NonRetryableJobError(
      'The campaign execution attempt no longer exists.',
      'CAMPAIGN_ATTEMPT_NOT_FOUND',
    )
  }

  if (attempt.status === 'ready' && attempt.call_id) {
    return {
      replay: true,
      attemptId: attempt.id,
      callId: attempt.call_id,
      status: attempt.status,
    }
  }

  const { data: campaign, error: campaignError } = await client
    .from('campaigns')
    .select('id,status,name')
    .eq('id', campaignId)
    .eq('organization_id', member.organization_id)
    .maybeSingle()

  if (campaignError) {
    throw new Error(campaignError.message)
  }

  if (!campaign || campaign.status !== 'active') {
    await client
      .from('campaign_member_attempts')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        error_code: 'CAMPAIGN_NOT_ACTIVE',
        error_message: 'The campaign is not active.',
      })
      .eq('id', attemptId)

    await client
      .from('campaign_members')
      .update({
        status: 'pending',
        reservation_token: null,
        reserved_at: null,
        reservation_expires_at: null,
        processing_job_id: null,
        current_attempt_id: null,
        next_attempt_at: null,
        last_error_code: 'CAMPAIGN_NOT_ACTIVE',
        last_error_message: 'The campaign is not active.',
      })
      .eq('id', member.id)

    return {
      skipped: true,
      reason: 'Campaign is not active.',
    }
  }

  const { data: contact, error: contactError } = await client
    .from('contacts')
    .select('id,first_name,last_name,phone,status')
    .eq('id', contactId)
    .eq('organization_id', member.organization_id)
    .maybeSingle()

  if (contactError) {
    throw new Error(contactError.message)
  }

  if (!contact || contact.status === 'archived') {
    await client
      .from('campaign_member_attempts')
      .update({
        status: 'skipped',
        completed_at: new Date().toISOString(),
        error_code: 'CONTACT_UNAVAILABLE',
        error_message: 'The campaign contact is missing or archived.',
      })
      .eq('id', attemptId)

    await client
      .from('campaign_members')
      .update({
        status: 'skipped',
        completed_at: new Date().toISOString(),
        reservation_token: null,
        reserved_at: null,
        reservation_expires_at: null,
        processing_job_id: null,
        last_error_code: 'CONTACT_UNAVAILABLE',
        last_error_message: 'The campaign contact is missing or archived.',
      })
      .eq('id', member.id)

    return {
      skipped: true,
      reason: 'Contact is unavailable.',
    }
  }

  if (!isE164(contact.phone)) {
    await client
      .from('campaign_member_attempts')
      .update({
        status: 'skipped',
        completed_at: new Date().toISOString(),
        error_code: 'INVALID_PHONE_NUMBER',
        error_message: 'The contact does not have a valid E.164 phone number.',
      })
      .eq('id', attemptId)

    await client
      .from('campaign_members')
      .update({
        status: 'skipped',
        completed_at: new Date().toISOString(),
        reservation_token: null,
        reserved_at: null,
        reservation_expires_at: null,
        processing_job_id: null,
        last_error_code: 'INVALID_PHONE_NUMBER',
        last_error_message:
          'The contact does not have a valid E.164 phone number.',
      })
      .eq('id', member.id)

    return {
      skipped: true,
      reason: 'Contact phone number is invalid.',
    }
  }

  await enforceAutomationRules({
    organizationId: member.organization_id,
    contactId: contact.id,
    channel: 'call',
    source: 'campaign',
    recipient: contact.phone,
  })

  await client
    .from('campaign_member_attempts')
    .update({
      status: 'preparing',
      started_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    })
    .eq('id', attemptId)

  const { data: existingCall, error: existingCallError } = await client
    .from('calls')
    .select('id')
    .eq('organization_id', member.organization_id)
    .eq('campaign_id', campaignId)
    .eq('contact_id', contactId)
    .contains('metadata', { campaign_attempt_id: attemptId })
    .maybeSingle()

  if (existingCallError) {
    throw new Error(existingCallError.message)
  }

  let callId = existingCall?.id ?? null

  if (!callId) {
    const { data: call, error: callError } = await client
      .from('calls')
      .insert({
        organization_id: member.organization_id,
        campaign_id: campaignId,
        contact_id: contactId,
        direction: 'outbound',
        status: 'scheduled',
        started_at: new Date().toISOString(),
        duration_seconds: null,
        recording_available: false,
        notes: `Prepared by campaign automation: ${campaign.name}`,
        metadata: {
          source: 'campaign_execution',
          campaign_member_id: member.id,
          campaign_attempt_id: attemptId,
          reservation_token: reservationToken,
        },
        owner_membership_id: member.owner_membership_id,
        created_by: null,
      })
      .select('id')
      .single()

    if (callError) {
      throw new Error(
        `Unable to prepare the campaign call: ${callError.message}`,
      )
    }

    callId = call.id
  }

  const readyAt = new Date().toISOString()

  const { error: attemptUpdateError } = await client
    .from('campaign_member_attempts')
    .update({
      status: 'ready',
      call_id: callId,
      ready_at: readyAt,
      error_code: null,
      error_message: null,
    })
    .eq('id', attemptId)

  if (attemptUpdateError) {
    throw new Error(attemptUpdateError.message)
  }

  const { error: memberUpdateError } = await client
    .from('campaign_members')
    .update({
      processing_job_id: null,
      last_error_code: null,
      last_error_message: null,
      updated_at: readyAt,
    })
    .eq('id', member.id)
    .eq('reservation_token', reservationToken)

  if (memberUpdateError) {
    throw new Error(memberUpdateError.message)
  }

  return {
    campaignId,
    campaignMemberId,
    attemptId,
    callId,
    status: 'ready',
  }
}

export async function scheduleCampaignMembers(input?: {
  campaignId?: string | null
  limit?: number
  leaseSeconds?: number
}) {
  const client = createServiceClient()

  if (input?.campaignId?.trim()) {
    const { data: campaign } = await client
      .from('campaigns')
      .select('organization_id')
      .eq('id', input.campaignId.trim())
      .maybeSingle()

    if (campaign?.organization_id) {
      const state = await isAutomationPaused(
        campaign.organization_id,
        'campaigns',
      )

      if (state.paused) {
        return {
          scheduled: 0,
          skipped: 0,
          released: 0,
          exhausted: 0,
          paused: true,
        }
      }
    }
  }

  const recovery = await client.rpc(
    'recover_expired_campaign_reservations',
    {
      p_limit: 200,
    },
  )

  if (recovery.error) {
    throw new Error(
      `Unable to recover campaign reservations: ${recovery.error.message}`,
    )
  }

  const { data, error } = await client.rpc(
    'schedule_campaign_members',
    {
      p_campaign_id: input?.campaignId?.trim() || null,
      p_limit: Math.max(1, Math.min(input?.limit ?? 25, 200)),
      p_lease_seconds: Math.max(
        120,
        Math.min(input?.leaseSeconds ?? 900, 3600),
      ),
    },
  )

  if (error) {
    throw new Error(
      `Unable to schedule campaign members: ${error.message}`,
    )
  }

  const scheduledRow = Array.isArray(data) ? data[0] : data
  const recoveryRow = Array.isArray(recovery.data)
    ? recovery.data[0]
    : recovery.data

  return {
    scheduled: Number(scheduledRow?.scheduled ?? 0),
    skipped: Number(scheduledRow?.skipped ?? 0),
    released: Number(recoveryRow?.released ?? 0),
    exhausted: Number(recoveryRow?.exhausted ?? 0),
  }
}

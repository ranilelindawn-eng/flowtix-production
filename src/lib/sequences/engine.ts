import { createClient } from '@supabase/supabase-js'

import { enforceAutomationRules } from '@/lib/compliance/automation-rules'
import { NonRetryableJobError, type JsonValue } from '@/lib/jobs/types'

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('Missing Supabase service-role configuration.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function asObject(value: JsonValue): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NonRetryableJobError('The sequence job payload is invalid.', 'INVALID_SEQUENCE_PAYLOAD')
  }
  return value as Record<string, JsonValue>
}

function requiredString(value: JsonValue | undefined, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new NonRetryableJobError(`${label} is required.`, 'INVALID_SEQUENCE_PAYLOAD')
  }
  return value.trim()
}

async function enqueueCommunication(input: {
  organizationId: string
  enrollmentId: string
  executionId: string
  stepId: string
  contactId: string
  channel: 'email' | 'sms'
  recipient: string
  subject: string | null
  body: string
}) {
  const client = createServiceClient()
  const { data: message, error: messageError } = await client
    .from('communication_messages')
    .upsert(
      {
        organization_id: input.organizationId,
        contact_id: input.contactId,
        channel: input.channel,
        direction: 'outbound',
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        status: 'queued',
        source: 'sequence',
        source_record_id: input.executionId,
      },
      {
        onConflict: 'organization_id,source,source_record_id',
        ignoreDuplicates: false,
      },
    )
    .select('id,background_job_id')
    .single()

  if (messageError) {
    throw new Error(`Unable to create sequence communication: ${messageError.message}`)
  }
  if (message.background_job_id) return message.background_job_id

  const idempotencyKey = `sequence-communication:${input.executionId}`
  const { data: job, error: jobError } = await client
    .from('background_jobs')
    .upsert(
      {
        organization_id: input.organizationId,
        queue: 'communications',
        job_type: 'communications.send',
        payload: { messageId: message.id },
        status: 'queued',
        priority: 80,
        scheduled_at: new Date().toISOString(),
        max_attempts: 6,
        idempotency_key: idempotencyKey,
      },
      {
        onConflict: 'organization_id,idempotency_key',
        ignoreDuplicates: false,
      },
    )
    .select('id')
    .single()

  if (jobError) {
    throw new Error(`Unable to dispatch sequence communication: ${jobError.message}`)
  }

  const { error: linkError } = await client
    .from('communication_messages')
    .update({ background_job_id: job.id })
    .eq('id', message.id)
    .eq('organization_id', input.organizationId)

  if (linkError) {
    throw new Error(`Unable to link sequence communication job: ${linkError.message}`)
  }

  return job.id
}

export async function executeSequenceStep(
  payloadValue: JsonValue,
): Promise<Record<string, JsonValue>> {
  const payload = asObject(payloadValue)
  const enrollmentId = requiredString(payload.enrollmentId, 'Enrollment ID')
  const expectedStepId = requiredString(payload.stepId, 'Step ID')
  const client = createServiceClient()

  const { data: enrollment, error: enrollmentError } = await client
    .from('sequence_enrollments')
    .select('id,organization_id,sequence_id,contact_id,current_step,status,owner_membership_id,processing_job_id')
    .eq('id', enrollmentId)
    .maybeSingle()
  if (enrollmentError) throw new Error(enrollmentError.message)
  if (!enrollment) throw new NonRetryableJobError('Sequence enrollment no longer exists.', 'ENROLLMENT_NOT_FOUND')
  if (enrollment.status !== 'active') return { skipped: true, reason: `Enrollment is ${enrollment.status}.` }

  const { data: sequence, error: sequenceError } = await client
    .from('sequences').select('id,status').eq('id', enrollment.sequence_id).maybeSingle()
  if (sequenceError) throw new Error(sequenceError.message)
  if (!sequence || sequence.status !== 'active') return { skipped: true, reason: 'Sequence is not active.' }

  const { data: step, error: stepError } = await client
    .from('sequence_steps')
    .select('id,position,channel,delay_days,subject,body')
    .eq('sequence_id', enrollment.sequence_id)
    .eq('position', enrollment.current_step)
    .maybeSingle()
  if (stepError) throw new Error(stepError.message)
  if (!step) {
    await client.from('sequence_enrollments').update({
      status: 'completed', completed_at: new Date().toISOString(), next_run_at: null,
      processing_job_id: null, last_error: null,
    }).eq('id', enrollment.id)
    return { completed: true, reason: 'No remaining step.' }
  }
  if (step.id !== expectedStepId) {
    throw new NonRetryableJobError('The scheduled step no longer matches the enrollment.', 'STALE_SEQUENCE_STEP')
  }

  const idempotencyKey = `sequence-execution:${enrollment.id}:${step.id}`
  const { data: existing } = await client.from('sequence_step_executions')
    .select('id,status,dispatch_job_id').eq('enrollment_id', enrollment.id).eq('step_id', step.id).maybeSingle()
  if (existing?.status === 'completed' || existing?.status === 'dispatched') {
    return { replay: true, executionId: existing.id, status: existing.status }
  }

  const { data: execution, error: executionError } = await client
    .from('sequence_step_executions')
    .upsert({
      organization_id: enrollment.organization_id,
      enrollment_id: enrollment.id,
      sequence_id: enrollment.sequence_id,
      step_id: step.id,
      contact_id: enrollment.contact_id,
      step_position: step.position,
      channel: step.channel,
      status: 'processing',
      idempotency_key: idempotencyKey,
      started_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    }, { onConflict: 'enrollment_id,step_id' })
    .select('id').single()
  if (executionError) throw new Error(executionError.message)

  const { data: contact, error: contactError } = await client
    .from('contacts').select('id,email,phone,first_name,last_name')
    .eq('id', enrollment.contact_id).eq('organization_id', enrollment.organization_id).maybeSingle()
  if (contactError) throw new Error(contactError.message)
  if (!contact) throw new NonRetryableJobError('Sequence contact no longer exists.', 'CONTACT_NOT_FOUND')

  let dispatchJobId: string | null = null
  if (step.channel === 'email' || step.channel === 'sms') {
    const recipient = step.channel === 'email' ? contact.email : contact.phone
    if (!recipient) {
      await client.from('sequence_step_executions').update({
        status: 'skipped', error_code: 'MISSING_RECIPIENT',
        error_message: `The contact has no ${step.channel} recipient.`, completed_at: new Date().toISOString(),
      }).eq('id', execution.id)
    } else {
      dispatchJobId = await enqueueCommunication({
        organizationId: enrollment.organization_id,
        enrollmentId: enrollment.id,
        executionId: execution.id,
        stepId: step.id,
        contactId: contact.id,
        channel: step.channel,
        recipient,
        subject: step.subject,
        body: step.body ?? '',
      })
      await client.from('sequence_step_executions').update({
        status: 'dispatched', dispatch_job_id: dispatchJobId,
        dispatched_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      }).eq('id', execution.id)
    }
  } else {
    if (step.channel === 'call') {
      if (!contact.phone) {
        throw new NonRetryableJobError(
          'The sequence contact has no phone number.',
          'MISSING_RECIPIENT',
        )
      }

      await enforceAutomationRules({
        organizationId: enrollment.organization_id,
        contactId: contact.id,
        channel: 'call',
        source: 'sequence',
        recipient: contact.phone,
      })
    }

    const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || contact.phone || 'contact'
    const title = step.channel === 'call' ? `Call ${contactName}` : `Follow up with ${contactName}`
    const { error } = await client.from('contact_tasks').insert({
      organization_id: enrollment.organization_id,
      contact_id: contact.id,
      title,
      description: step.body || step.subject || `Sequence step ${step.position}`,
      due_at: new Date().toISOString(),
      status: 'pending',
      priority: step.channel === 'call' ? 'high' : 'medium',
      assigned_to: null,
      owner_membership_id: enrollment.owner_membership_id,
      created_by: null,
      completed_at: null,
    })
    if (error) throw new Error(`Unable to create sequence task: ${error.message}`)
    await client.from('sequence_step_executions').update({
      status: 'completed', provider_resource_type: 'contact_task', completed_at: new Date().toISOString(),
    }).eq('id', execution.id)
  }

  const nextPosition = enrollment.current_step + 1
  const { data: nextStep, error: nextError } = await client
    .from('sequence_steps').select('id,delay_days').eq('sequence_id', enrollment.sequence_id)
    .eq('position', nextPosition).maybeSingle()
  if (nextError) throw new Error(nextError.message)

  if (!nextStep) {
    await client.from('sequence_enrollments').update({
      current_step: nextPosition, status: 'completed', completed_at: new Date().toISOString(),
      next_run_at: null, processing_job_id: null, last_step_id: step.id,
      last_error: null, consecutive_failures: 0,
    }).eq('id', enrollment.id)
  } else {
    const nextRunAt = new Date(Date.now() + Math.max(0, nextStep.delay_days ?? 0) * 86400000).toISOString()
    await client.from('sequence_enrollments').update({
      current_step: nextPosition, next_run_at: nextRunAt, processing_job_id: null,
      last_step_id: step.id, last_error: null, consecutive_failures: 0,
    }).eq('id', enrollment.id)
  }

  return { executionId: execution.id, dispatchJobId, channel: step.channel, nextStep: nextStep?.id ?? null }
}

export async function scheduleDueSequenceEnrollments(limit = 50) {
  const client = createServiceClient()
  const { data, error } = await client.rpc('schedule_due_sequence_enrollments', { p_limit: limit })
  if (error) throw new Error(`Unable to schedule sequence enrollments: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return { scheduled: Number(row?.scheduled ?? 0), skipped: Number(row?.skipped ?? 0) }
}
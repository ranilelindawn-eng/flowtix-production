'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth'
import { enqueueJob } from '@/lib/jobs/queue'
import { writeAuditEvent } from '@/lib/security/audit'
import { createClient } from '@/lib/supabase/server'

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').trim()
}

function optional(value: string) {
  return value.trim() || null
}

function validateChannel(value: string): 'email' | 'sms' {
  if (value !== 'email' && value !== 'sms') {
    throw new Error('Choose Email or SMS.')
  }
  return value
}

function validateRecipient(channel: 'email' | 'sms', recipient: string) {
  if (!recipient) throw new Error('A recipient is required.')

  if (channel === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      throw new Error('Enter a valid email address.')
    }
    return
  }

  if (!/^\+[1-9]\d{7,14}$/.test(recipient)) {
    throw new Error('SMS recipients must use E.164 format, for example +15551234567.')
  }
}

async function queueMessage(input: {
  organizationId: string
  messageId: string
}) {
  const supabase = await createClient()

  try {
    const job = await enqueueJob({
      organizationId: input.organizationId,
      queue: 'communications',
      jobType: 'communications.send',
      payload: { messageId: input.messageId },
      priority: 70,
      maxAttempts: 6,
      idempotencyKey: `communication:${input.messageId}`,
    })

    const { error } = await supabase
      .from('communication_messages')
      .update({ background_job_id: job.id })
      .eq('id', input.messageId)
      .eq('organization_id', input.organizationId)

    if (error) {
      throw new Error(`Unable to link communication job: ${error.message}`)
    }
  } catch (queueError) {
    await supabase
      .from('communication_messages')
      .update({
        status: 'failed',
        error_message:
          queueError instanceof Error
            ? queueError.message
            : 'Unable to create the delivery job.',
        last_error_code: 'QUEUE_CREATION_FAILED',
      })
      .eq('id', input.messageId)
      .eq('organization_id', input.organizationId)

    throw queueError
  }
}

export async function composeCommunication(formData: FormData) {
  const membership = await requirePermission('communications.create')
  const supabase = await createClient()
  const channel = validateChannel(text(formData, 'channel'))
  const recipient = text(formData, 'recipient')
  const subject = text(formData, 'subject')
  const body = text(formData, 'body')

  validateRecipient(channel, recipient)
  if (!body) throw new Error('A message is required.')

  const { data: message, error } = await supabase
    .from('communication_messages')
    .insert({
      organization_id: membership.organization_id,
      channel,
      direction: 'outbound',
      recipient,
      subject: channel === 'email' ? optional(subject) : null,
      body,
      status: 'queued',
      source: 'manual',
      sent_by: membership.user_id,
    })
    .select('id,conversation_id')
    .single()

  if (error || !message) {
    throw new Error(`Unable to queue communication: ${error?.message ?? 'Message was not created.'}`)
  }

  await queueMessage({
    organizationId: membership.organization_id,
    messageId: message.id,
  })

  await writeAuditEvent({
    action: 'communications.message.queued',
    resourceType: 'communication_message',
    resourceId: message.id,
    organizationId: membership.organization_id,
    metadata: {
      channel,
      conversationId: message.conversation_id,
      source: 'manual',
    },
  })

  revalidatePath('/dashboard/communications')
  revalidatePath('/dashboard/timeline')

  if (message.conversation_id) {
    redirect(`/dashboard/communications?conversation=${encodeURIComponent(message.conversation_id)}`)
  }
}

export async function replyToConversation(formData: FormData) {
  const membership = await requirePermission('communications.reply')
  const supabase = await createClient()
  const conversationId = text(formData, 'conversation_id')
  const channel = validateChannel(text(formData, 'channel'))
  const body = text(formData, 'body')

  if (!conversationId) throw new Error('Conversation ID is required.')
  if (!body) throw new Error('A reply is required.')

  const { data: conversation, error: conversationError } = await supabase
    .from('communication_conversations')
    .select('id,contact_id,participant_address,subject,last_email_thread_id,last_email_internet_message_id,status')
    .eq('id', conversationId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (conversationError) {
    throw new Error(`Unable to load conversation: ${conversationError.message}`)
  }
  if (!conversation) {
    throw new Error('Conversation is unavailable or you do not have access to it.')
  }
  if (conversation.status === 'closed') {
    throw new Error('Reopen this conversation before replying.')
  }

  let contact: { email: string | null; phone: string | null } | null = null
  if (conversation.contact_id) {
    const { data, error } = await supabase
      .from('contacts')
      .select('email,phone')
      .eq('id', conversation.contact_id)
      .eq('organization_id', membership.organization_id)
      .maybeSingle()

    if (error) {
      throw new Error(`Unable to load the conversation contact: ${error.message}`)
    }
    contact = data
  }

  const participant = String(conversation.participant_address ?? '').trim()
  const recipient = channel === 'email'
    ? String(contact?.email ?? (participant.includes('@') ? participant : '')).trim()
    : String(contact?.phone ?? (participant.startsWith('+') ? participant : '')).trim()

  validateRecipient(channel, recipient)

  const subject = channel === 'email'
    ? String(conversation.subject ?? 'Message from Flowtix').trim() || 'Message from Flowtix'
    : null

  const { data: message, error } = await supabase
    .from('communication_messages')
    .insert({
      organization_id: membership.organization_id,
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      channel,
      direction: 'outbound',
      recipient,
      subject,
      body,
      provider_thread_id: channel === 'email' ? conversation.last_email_thread_id : null,
      in_reply_to: channel === 'email' ? conversation.last_email_internet_message_id : null,
      references_header: channel === 'email' ? conversation.last_email_internet_message_id : null,
      status: 'queued',
      source: 'manual',
      sent_by: membership.user_id,
    })
    .select('id')
    .single()

  if (error || !message) {
    throw new Error(`Unable to queue reply: ${error?.message ?? 'Reply was not created.'}`)
  }

  await queueMessage({
    organizationId: membership.organization_id,
    messageId: message.id,
  })

  await writeAuditEvent({
    action: 'communications.reply.queued',
    resourceType: 'communication_conversation',
    resourceId: conversation.id,
    organizationId: membership.organization_id,
    metadata: {
      channel,
      communicationMessageId: message.id,
    },
  })

  revalidatePath('/dashboard/communications')
  revalidatePath('/dashboard/timeline')
}

export async function assignConversation(formData: FormData) {
  const membership = await requirePermission('communications.assign')
  const supabase = await createClient()
  const conversationId = text(formData, 'conversation_id')
  const assignedMembershipId = optional(text(formData, 'assigned_membership_id'))

  if (!conversationId) throw new Error('Conversation ID is required.')

  const { data, error } = await supabase.rpc('assign_communication_conversation', {
    p_conversation_id: conversationId,
    p_assigned_membership_id: assignedMembershipId,
  })

  if (error || data !== true) {
    throw new Error(error?.message ?? 'Unable to assign the conversation.')
  }

  await writeAuditEvent({
    action: 'communications.conversation.assigned',
    resourceType: 'communication_conversation',
    resourceId: conversationId,
    organizationId: membership.organization_id,
    metadata: { assignedMembershipId },
  })

  revalidatePath('/dashboard/communications')
}

export async function setConversationStatus(formData: FormData) {
  const membership = await requirePermission('communications.manage')
  const supabase = await createClient()
  const conversationId = text(formData, 'conversation_id')
  const status = text(formData, 'status')

  if (!conversationId) throw new Error('Conversation ID is required.')
  if (status !== 'open' && status !== 'closed') {
    throw new Error('Choose a valid conversation status.')
  }

  const { data, error } = await supabase.rpc('set_communication_conversation_status', {
    p_conversation_id: conversationId,
    p_status: status,
  })

  if (error || data !== true) {
    throw new Error(error?.message ?? 'Unable to update the conversation status.')
  }

  await writeAuditEvent({
    action: `communications.conversation.${status}`,
    resourceType: 'communication_conversation',
    resourceId: conversationId,
    organizationId: membership.organization_id,
  })

  revalidatePath('/dashboard/communications')
}

export async function markConversationRead(conversationId: string) {
  const membership = await requirePermission('communications.view')
  const supabase = await createClient()
  const normalizedId = conversationId.trim()

  if (!normalizedId) return

  const { data: conversation, error: conversationError } = await supabase
    .from('communication_conversations')
    .select('id')
    .eq('id', normalizedId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (conversationError || !conversation) return

  const { data: latestMessage } = await supabase
    .from('communication_messages')
    .select('id,created_at')
    .eq('organization_id', membership.organization_id)
    .eq('conversation_id', normalizedId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from('communication_conversation_reads')
    .upsert(
      {
        organization_id: membership.organization_id,
        conversation_id: normalizedId,
        user_id: membership.user_id,
        last_read_message_id: latestMessage?.id ?? null,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'conversation_id,user_id' },
    )

  if (error) {
    console.error('Unable to mark conversation read:', error.message)
  }

  revalidatePath('/dashboard/communications')
}

export async function markConversationUnread(formData: FormData) {
  const membership = await requirePermission('communications.view')
  const supabase = await createClient()
  const conversationId = text(formData, 'conversation_id')

  if (!conversationId) return

  const { data: latestInbound, error: inboundError } = await supabase
    .from('communication_messages')
    .select('id,received_at,sent_at,created_at')
    .eq('organization_id', membership.organization_id)
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (inboundError) {
    throw new Error(`Unable to locate the latest inbound reply: ${inboundError.message}`)
  }
  if (!latestInbound) return

  const latestAt = new Date(
    latestInbound.received_at || latestInbound.sent_at || latestInbound.created_at,
  )
  const markBefore = Number.isNaN(latestAt.getTime())
    ? new Date(Date.now() - 1).toISOString()
    : new Date(latestAt.getTime() - 1).toISOString()

  const { error } = await supabase
    .from('communication_conversation_reads')
    .upsert(
      {
        organization_id: membership.organization_id,
        conversation_id: conversationId,
        user_id: membership.user_id,
        last_read_message_id: null,
        last_read_at: markBefore,
      },
      { onConflict: 'conversation_id,user_id' },
    )

  if (error) {
    throw new Error(`Unable to mark conversation unread: ${error.message}`)
  }

  revalidatePath('/dashboard/communications')
}

export async function activateGmailInbox() {
  const membership = await requirePermission('communications.manage')

  await enqueueJob({
    organizationId: membership.organization_id,
    queue: 'communications',
    jobType: 'communications.gmail_watch_renew',
    payload: { organizationId: membership.organization_id },
    priority: 60,
    maxAttempts: 5,
  })

  await writeAuditEvent({
    action: 'communications.gmail_watch.requested',
    resourceType: 'organization_integration',
    organizationId: membership.organization_id,
    metadata: { provider: 'gmail' },
  })

  revalidatePath('/dashboard/communications')
}


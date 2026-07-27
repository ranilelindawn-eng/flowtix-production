'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const text = (formData: FormData, key: string) => formData.get(key)?.toString().trim() ?? ''
const optional = (value: string) => value || null

async function context() {
  const membership = await requireOrganization()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required.')
  return { membership, supabase, user }
}

export async function createCompany(formData: FormData) {
  const { membership, supabase, user } = await context()
  const name = text(formData, 'name')
  if (!name) throw new Error('Company name is required.')
  const { data, error } = await supabase.from('companies').insert({
    organization_id: membership.organization_id,
    name,
    domain: optional(text(formData, 'domain')),
    industry: optional(text(formData, 'industry')),
    phone: optional(text(formData, 'phone')),
    email: optional(text(formData, 'email')),
    website: optional(text(formData, 'website')),
    address: optional(text(formData, 'address')),
    city: optional(text(formData, 'city')),
    country: optional(text(formData, 'country')),
    status: text(formData, 'status') || 'active',
    description: optional(text(formData, 'description')),
    owner_id: user.id,
    created_by: user.id,
  }).select('id').single()
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/companies')
  redirect(`/dashboard/companies/${data.id}`)
}

export async function updateCompany(formData: FormData) {
  const { membership, supabase } = await context()
  const companyId = text(formData, 'id')
  const name = text(formData, 'name')

  if (!companyId) throw new Error('Company ID is required.')
  if (!name) throw new Error('Company name is required.')

  const { data: existingCompany, error: loadError } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (loadError) {
    throw new Error(`Failed to load company: ${loadError.message}`)
  }

  if (!existingCompany) {
    throw new Error('Company not found.')
  }

  const { error } = await supabase
    .from('companies')
    .update({
      name,
      domain: optional(text(formData, 'domain')),
      industry: optional(text(formData, 'industry')),
      phone: optional(text(formData, 'phone')),
      email: optional(text(formData, 'email')),
      website: optional(text(formData, 'website')),
      address: optional(text(formData, 'address')),
      city: optional(text(formData, 'city')),
      country: optional(text(formData, 'country')),
      status: text(formData, 'status') || 'active',
      description: optional(text(formData, 'description')),
    })
    .eq('id', companyId)
    .eq('organization_id', membership.organization_id)

  if (error) {
    throw new Error(`Failed to update company: ${error.message}`)
  }

  revalidatePath('/dashboard/companies')
  revalidatePath(`/dashboard/companies/${companyId}`)
  revalidatePath(`/dashboard/companies/${companyId}/edit`)
  redirect(`/dashboard/companies/${companyId}`)
}

export async function deleteCompany(formData: FormData) {
  const { membership, supabase } = await context()
  const companyId = text(formData, 'id')

  if (!companyId) throw new Error('Company ID is required.')

  const { data: existingCompany, error: loadError } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (loadError) {
    throw new Error(`Failed to load company: ${loadError.message}`)
  }

  if (!existingCompany) {
    throw new Error('Company not found.')
  }

  const { data: attachments, error: attachmentLoadError } = await supabase
    .from('attachments')
    .select('storage_path')
    .eq('organization_id', membership.organization_id)
    .eq('entity_type', 'company')
    .eq('entity_id', companyId)

  if (attachmentLoadError) {
    throw new Error(
      `Failed to load company attachments: ${attachmentLoadError.message}`,
    )
  }

  const { error: contactsError } = await supabase
    .from('contacts')
    .update({ company_id: null })
    .eq('organization_id', membership.organization_id)
    .eq('company_id', companyId)

  if (contactsError) {
    throw new Error(`Failed to unlink company contacts: ${contactsError.message}`)
  }

  const { error: opportunitiesError } = await supabase
    .from('opportunities')
    .update({ company_id: null })
    .eq('organization_id', membership.organization_id)
    .eq('company_id', companyId)

  if (opportunitiesError) {
    throw new Error(
      `Failed to unlink company opportunities: ${opportunitiesError.message}`,
    )
  }

  const { error: commentsError } = await supabase
    .from('internal_comments')
    .delete()
    .eq('organization_id', membership.organization_id)
    .eq('entity_type', 'company')
    .eq('entity_id', companyId)

  if (commentsError) {
    throw new Error(`Failed to delete company comments: ${commentsError.message}`)
  }

  const { error: attachmentsError } = await supabase
    .from('attachments')
    .delete()
    .eq('organization_id', membership.organization_id)
    .eq('entity_type', 'company')
    .eq('entity_id', companyId)

  if (attachmentsError) {
    throw new Error(
      `Failed to delete company attachment records: ${attachmentsError.message}`,
    )
  }

  const storagePaths =
    attachments
      ?.map((attachment) => attachment.storage_path)
      .filter((path): path is string => Boolean(path)) ?? []

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from('crm-attachments')
      .remove(storagePaths)

    if (storageError) {
      throw new Error(
        `Failed to delete company attachment files: ${storageError.message}`,
      )
    }
  }

  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', companyId)
    .eq('organization_id', membership.organization_id)

  if (error) {
    throw new Error(`Failed to delete company: ${error.message}`)
  }

  revalidatePath('/dashboard/companies')
  redirect('/dashboard/companies')
}

export async function createPipeline(formData: FormData) {
  const { membership, supabase, user } = await context()
  const name = text(formData, 'name')
  if (!name) throw new Error('Pipeline name is required.')
  const { data: pipeline, error } = await supabase.from('pipelines').insert({
    organization_id: membership.organization_id,
    name,
    description: optional(text(formData, 'description')),
    created_by: user.id,
  }).select('id').single()
  if (error) throw new Error(error.message)
  const names = ['New', 'Qualified', 'Proposal', 'Negotiation', 'Won']
  const { error: stageError } = await supabase.from('pipeline_stages').insert(names.map((stage, index) => ({
    organization_id: membership.organization_id,
    pipeline_id: pipeline.id,
    name: stage,
    position: index + 1,
    probability: [10, 25, 50, 75, 100][index],
  })))
  if (stageError) throw new Error(stageError.message)
  revalidatePath('/dashboard/pipelines')
}

export async function createOpportunity(formData: FormData) {
  const { membership, supabase, user } = await context()
  const name = text(formData, 'name')
  if (!name) throw new Error('Opportunity name is required.')
  const pipelineId = text(formData, 'pipeline_id')
  let stageId = text(formData, 'stage_id')
  if (!stageId && pipelineId) {
    const { data } = await supabase.from('pipeline_stages').select('id').eq('pipeline_id', pipelineId).order('position').limit(1).maybeSingle()
    stageId = data?.id ?? ''
  }
  if (!pipelineId || !stageId) throw new Error('A pipeline and stage are required.')
  const { error } = await supabase.from('opportunities').insert({
    organization_id: membership.organization_id,
    pipeline_id: pipelineId,
    stage_id: stageId,
    company_id: optional(text(formData, 'company_id')),
    contact_id: optional(text(formData, 'contact_id')),
    name,
    value: Number(text(formData, 'value') || '0'),
    currency: text(formData, 'currency') || 'USD',
    probability: Number(text(formData, 'probability') || '0'),
    expected_close_date: optional(text(formData, 'expected_close_date')),
    description: optional(text(formData, 'description')),
    owner_id: user.id,
    created_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/pipelines')
}

export async function createTag(formData: FormData) {
  const { membership, supabase } = await context()
  const name = text(formData, 'name')
  if (!name) throw new Error('Tag name is required.')
  const { error } = await supabase.from('tags').insert({ organization_id: membership.organization_id, name, color: text(formData, 'color') || '#2563eb' })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/tags')
}

export async function createTemplate(formData: FormData) {
  const { membership, supabase, user } = await context()
  const { error } = await supabase.from('message_templates').insert({
    organization_id: membership.organization_id,
    name: text(formData, 'name'),
    channel: text(formData, 'channel') || 'email',
    subject: optional(text(formData, 'subject')),
    body: text(formData, 'body'),
    created_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/templates')
}

export async function createSnippet(formData: FormData) {
  const { membership, supabase, user } = await context()
  const { error } = await supabase.from('snippets').insert({
    organization_id: membership.organization_id,
    name: text(formData, 'name'),
    shortcut: text(formData, 'shortcut'),
    content: text(formData, 'content'),
    created_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/snippets')
}

export async function createSequence(formData: FormData) {
  const { membership, supabase, user } = await context()
  const { data, error } = await supabase.from('sequences').insert({
    organization_id: membership.organization_id,
    name: text(formData, 'name'),
    description: optional(text(formData, 'description')),
    status: 'draft',
    created_by: user.id,
  }).select('id').single()
  if (error) throw new Error(error.message)
  const { error: stepError } = await supabase.from('sequence_steps').insert({
    organization_id: membership.organization_id,
    sequence_id: data.id,
    position: 1,
    channel: text(formData, 'channel') || 'email',
    delay_days: 0,
    subject: optional(text(formData, 'subject')),
    body: text(formData, 'body'),
  })
  if (stepError) throw new Error(stepError.message)
  revalidatePath('/dashboard/sequences')
}

export async function sendCommunication(formData: FormData) {
  const { membership, supabase, user } = await context()
  const channel = text(formData, 'channel') as 'email' | 'sms'
  const recipient = text(formData, 'recipient')
  const subject = text(formData, 'subject')
  const body = text(formData, 'body')
  if (!recipient || !body) throw new Error('Recipient and message are required.')
  let status = 'failed'
  let provider = ''
  let providerMessageId: string | null = null
  let errorMessage: string | null = null
  try {
    if (channel === 'email') {
      provider = 'resend'
      const apiKey = process.env.RESEND_API_KEY
      const from = process.env.RESEND_FROM_EMAIL
      if (!apiKey || !from) throw new Error('RESEND_API_KEY and RESEND_FROM_EMAIL are required.')
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [recipient], subject: subject || 'Message from CallFlow', html: body.replace(/\n/g, '<br>') }),
      })
      const payload = await response.json() as { id?: string; message?: string }
      if (!response.ok) throw new Error(payload.message || 'Email provider rejected the message.')
      providerMessageId = payload.id ?? null
    } else {
      provider = 'twilio'
      const sid = process.env.TWILIO_ACCOUNT_SID
      const token = process.env.TWILIO_AUTH_TOKEN
      const from = process.env.TWILIO_PHONE_NUMBER
      if (!sid || !token || !from) throw new Error('Twilio SMS credentials are required.')
      const params = new URLSearchParams({ To: recipient, From: from, Body: body })
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      })
      const payload = await response.json() as { sid?: string; message?: string }
      if (!response.ok) throw new Error(payload.message || 'SMS provider rejected the message.')
      providerMessageId = payload.sid ?? null
    }
    status = 'sent'
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown provider error.'
  }
  const { error: logError } = await supabase.from('communication_messages').insert({
    organization_id: membership.organization_id,
    channel,
    recipient,
    sender: channel === 'email' ? process.env.RESEND_FROM_EMAIL : process.env.TWILIO_PHONE_NUMBER,
    subject: optional(subject),
    body,
    provider,
    provider_message_id: providerMessageId,
    status,
    error_message: errorMessage,
    sent_by: user.id,
    sent_at: status === 'sent' ? new Date().toISOString() : null,
  })
  if (logError) throw new Error(logError.message)
  revalidatePath('/dashboard/communications')
}

export async function createComment(formData: FormData) {
  const { membership, supabase, user } = await context()
  const entityType = text(formData, 'entity_type')
  const entityId = text(formData, 'entity_id')
  const body = text(formData, 'body')
  if (!entityType || !entityId || !body) throw new Error('Comment details are required.')
  const { data: comment, error } = await supabase.from('internal_comments').insert({
    organization_id: membership.organization_id,
    entity_type: entityType,
    entity_id: entityId,
    body,
    created_by: user.id,
  }).select('id').single()
  if (error) throw new Error(error.message)
  const mentioned = [...body.matchAll(/@\[([0-9a-f-]{36})\]/gi)].map(match => match[1])
  if (mentioned.length) {
    const { error: mentionError } = await supabase.from('comment_mentions').insert([...new Set(mentioned)].map(mentioned_user_id => ({
      organization_id: membership.organization_id,
      comment_id: comment.id,
      mentioned_user_id,
    })))
    if (mentionError) throw new Error(mentionError.message)
  }
  revalidatePath(`/dashboard/${entityType === 'company' ? 'companies' : 'pipelines'}/${entityId}`)
}

export async function uploadAttachment(formData: FormData) {
  const { membership, supabase, user } = await context()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a file to upload.')
  if (file.size > 25 * 1024 * 1024) throw new Error('Maximum file size is 25 MB.')
  const entityType = text(formData, 'entity_type') || 'company'
  const entityId = text(formData, 'entity_id')
  if (!entityId) throw new Error('Attachment entity is required.')
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `${membership.organization_id}/${entityType}/${entityId}/${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('crm-attachments').upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw new Error(uploadError.message)
  const { error } = await supabase.from('attachments').insert({
    organization_id: membership.organization_id,
    entity_type: entityType,
    entity_id: entityId,
    file_name: file.name,
    storage_path: path,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/files')
  revalidatePath(`/dashboard/companies/${entityId}`)
}

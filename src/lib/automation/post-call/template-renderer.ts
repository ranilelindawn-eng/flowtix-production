import 'server-only'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'

export const POST_CALL_TEMPLATE_VARIABLES = [
  '{{contact.first_name}}',
  '{{contact.last_name}}',
  '{{contact.company}}',
  '{{agent.name}}',
  '{{organization.name}}',
  '{{call.duration}}',
  '{{call.status}}',
] as const

type SupportedVariable =
  | 'contact.first_name'
  | 'contact.last_name'
  | 'contact.company'
  | 'agent.name'
  | 'organization.name'
  | 'call.duration'
  | 'call.status'

type PostCallConfigRow = {
  enabled: boolean
  email_enabled: boolean
  sms_enabled: boolean
  email_subject: string | null
  email_body: string | null
  sms_body: string | null
}

type CallRow = {
  id: string
  organization_id: string
  contact_id: string | null
  created_by: string
  status: string
  duration_seconds: number | null
}

type ContactRow = {
  id: string
  first_name: string
  last_name: string
  company: string | null
  email: string | null
  phone: string | null
}

type OrganizationRow = {
  id: string
  name: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
}

export type PostCallTemplateContext = {
  contact: {
    firstName: string
    lastName: string
    company: string
  }
  agent: {
    name: string
  }
  organization: {
    name: string
  }
  call: {
    duration: string
    status: string
  }
}

export type RenderedPostCallTemplates = {
  organizationId: string
  callId: string
  contactId: string
  recipientEmail: string | null
  recipientPhone: string | null
  emailEnabled: boolean
  smsEnabled: boolean
  emailSubject: string | null
  emailBody: string | null
  smsBody: string | null
  context: PostCallTemplateContext
}

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return ''
  }

  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainingSeconds = wholeSeconds % 60

  if (minutes === 0) {
    return `${remainingSeconds}s`
  }

  if (remainingSeconds === 0) {
    return `${minutes}m`
  }

  return `${minutes}m ${remainingSeconds}s`
}

function valuesForContext(
  context: PostCallTemplateContext,
): Record<SupportedVariable, string> {
  return {
    'contact.first_name': context.contact.firstName,
    'contact.last_name': context.contact.lastName,
    'contact.company': context.contact.company,
    'agent.name': context.agent.name,
    'organization.name': context.organization.name,
    'call.duration': context.call.duration,
    'call.status': context.call.status,
  }
}

function collectUnknownVariables(template: string) {
  const unknown = new Set<string>()

  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    const name = match[1]
    if (
      name !== 'contact.first_name' &&
      name !== 'contact.last_name' &&
      name !== 'contact.company' &&
      name !== 'agent.name' &&
      name !== 'organization.name' &&
      name !== 'call.duration' &&
      name !== 'call.status'
    ) {
      unknown.add(name)
    }
  }

  return [...unknown]
}

export function renderPostCallTemplate(
  template: string,
  context: PostCallTemplateContext,
) {
  const unknown = collectUnknownVariables(template)

  if (unknown.length > 0) {
    throw new Error(
      `Unsupported post-call template variable${
        unknown.length === 1 ? '' : 's'
      }: ${unknown.map((name) => `{{${name}}}`).join(', ')}`,
    )
  }

  const values = valuesForContext(context)

  return template.replace(
    VARIABLE_PATTERN,
    (_match, rawName: string) =>
      values[rawName as SupportedVariable] ?? '',
  )
}

export async function renderPostCallTemplates(input: {
  organizationId: string
  callId: string
}): Promise<RenderedPostCallTemplates> {
  const admin = createTelephonyAdminClient()

  const { data: config, error: configError } = await admin
    .from('post_call_automation_configs')
    .select(
      'enabled,email_enabled,sms_enabled,email_subject,email_body,sms_body',
    )
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (configError) {
    throw new Error(
      `Unable to load post-call automation template configuration: ${configError.message}`,
    )
  }

  if (!config || config.enabled !== true) {
    throw new Error(
      'Post-call automation is no longer enabled for this organization.',
    )
  }

  const typedConfig = config as PostCallConfigRow

  const { data: call, error: callError } = await admin
    .from('calls')
    .select(
      'id,organization_id,contact_id,created_by,status,duration_seconds',
    )
    .eq('id', input.callId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (callError) {
    throw new Error(
      `Unable to load the post-call automation call: ${callError.message}`,
    )
  }

  if (!call) {
    throw new Error(
      'The post-call automation call no longer exists in this organization.',
    )
  }

  const typedCall = call as CallRow

  if (!typedCall.contact_id) {
    throw new Error(
      'The completed call is not associated with a CRM contact.',
    )
  }

  const [
    contactResult,
    organizationResult,
    profileResult,
  ] = await Promise.all([
    admin
      .from('contacts')
      .select('id,first_name,last_name,company,email,phone')
      .eq('id', typedCall.contact_id)
      .eq('organization_id', input.organizationId)
      .maybeSingle(),
    admin
      .from('organizations')
      .select('id,name')
      .eq('id', input.organizationId)
      .maybeSingle(),
    admin
      .from('profiles')
      .select('id,full_name,email')
      .eq('id', typedCall.created_by)
      .maybeSingle(),
  ])

  if (contactResult.error) {
    throw new Error(
      `Unable to load the post-call automation contact: ${contactResult.error.message}`,
    )
  }

  if (organizationResult.error) {
    throw new Error(
      `Unable to load the post-call automation organization: ${organizationResult.error.message}`,
    )
  }

  if (profileResult.error) {
    throw new Error(
      `Unable to load the post-call automation caller: ${profileResult.error.message}`,
    )
  }

  if (!contactResult.data) {
    throw new Error(
      'The CRM contact associated with this call no longer exists.',
    )
  }

  if (!organizationResult.data) {
    throw new Error(
      'The organization associated with this call no longer exists.',
    )
  }

  const contact = contactResult.data as ContactRow
  const organization = organizationResult.data as OrganizationRow
  const profile = profileResult.data as ProfileRow | null

  const context: PostCallTemplateContext = {
    contact: {
      firstName: contact.first_name ?? '',
      lastName: contact.last_name ?? '',
      company: contact.company ?? '',
    },
    agent: {
      name:
        profile?.full_name?.trim() ||
        profile?.email?.trim() ||
        '',
    },
    organization: {
      name: organization.name ?? '',
    },
    call: {
      duration: formatDuration(typedCall.duration_seconds),
      status: typedCall.status,
    },
  }

  const emailEnabled = typedConfig.email_enabled === true
  const smsEnabled = typedConfig.sms_enabled === true

  if (
    emailEnabled &&
    (!typedConfig.email_subject?.trim() ||
      !typedConfig.email_body?.trim())
  ) {
    throw new Error(
      'Email follow-up is enabled but its saved subject or message is missing.',
    )
  }

  if (smsEnabled && !typedConfig.sms_body?.trim()) {
    throw new Error(
      'SMS follow-up is enabled but its saved message is missing.',
    )
  }

  return {
    organizationId: input.organizationId,
    callId: typedCall.id,
    contactId: contact.id,
    recipientEmail: contact.email?.trim() || null,
    recipientPhone: contact.phone?.trim() || null,
    emailEnabled,
    smsEnabled,
    emailSubject:
      emailEnabled && typedConfig.email_subject
        ? renderPostCallTemplate(
            typedConfig.email_subject,
            context,
          )
        : null,
    emailBody:
      emailEnabled && typedConfig.email_body
        ? renderPostCallTemplate(typedConfig.email_body, context)
        : null,
    smsBody:
      smsEnabled && typedConfig.sms_body
        ? renderPostCallTemplate(typedConfig.sms_body, context)
        : null,
    context,
  }
}

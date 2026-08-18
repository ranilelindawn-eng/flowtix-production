import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getTeamMembers, type CurrentOrganizationMembership } from '@/lib/team'

export type ConversationChannel = 'email' | 'sms'
export type ConversationDirection = 'inbound' | 'outbound'

export type ConversationSummary = {
  id: string
  organizationId: string
  contactId: string | null
  companyId: string | null
  contactName: string
  contactEmail: string | null
  contactPhone: string | null
  companyName: string | null
  participantAddress: string | null
  primaryChannel: ConversationChannel
  lastChannel: ConversationChannel
  subject: string | null
  status: 'open' | 'closed'
  assignedMembershipId: string | null
  assignedName: string | null
  lastMessagePreview: string
  lastMessageAt: string | null
  lastInboundAt: string | null
  lastOutboundAt: string | null
  lastDirection: ConversationDirection | null
  lastEmailThreadId: string | null
  unreadCount: number
}

export type ConversationMessage = {
  id: string
  conversationId: string
  contactId: string | null
  channel: ConversationChannel
  direction: ConversationDirection
  recipient: string
  sender: string | null
  subject: string | null
  body: string
  provider: string | null
  providerMessageId: string | null
  providerThreadId: string | null
  status: string
  errorMessage: string | null
  sentBy: string | null
  sentByName: string | null
  sentAt: string | null
  receivedAt: string | null
  deliveredAt: string | null
  failedAt: string | null
  createdAt: string
}

export type ConversationInboxData = {
  conversations: ConversationSummary[]
  selectedConversation: ConversationSummary | null
  messages: ConversationMessage[]
  teamMembers: Array<{
    id: string
    name: string
    email: string | null
    role: string
  }>
  unreadConversationCount: number
  canCompose: boolean
  canAssign: boolean
  canManage: boolean
  canReply: boolean
  gmail: {
    connected: boolean
    connectedEmail: string | null
    watchStatus: string | null
    watchExpiration: string | null
    lastSyncAt: string | null
  }
}

type ConversationRow = {
  id: string
  organization_id: string
  contact_id: string | null
  company_id: string | null
  primary_channel: ConversationChannel
  last_channel: ConversationChannel
  participant_address: string | null
  subject: string | null
  status: 'open' | 'closed'
  assigned_membership_id: string | null
  last_message_preview: string | null
  last_message_at: string | null
  last_inbound_at: string | null
  last_outbound_at: string | null
  last_direction: ConversationDirection | null
  last_email_thread_id: string | null
  created_at: string
}

type ContactRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  company_id: string | null
}

type CompanyRow = {
  id: string
  name: string
}

type MessageRow = {
  id: string
  conversation_id: string | null
  contact_id: string | null
  channel: ConversationChannel
  direction: ConversationDirection
  recipient: string
  sender: string | null
  subject: string | null
  body: string
  provider: string | null
  provider_message_id: string | null
  provider_thread_id: string | null
  status: string
  error_message: string | null
  sent_by: string | null
  sent_at: string | null
  received_at: string | null
  delivered_at: string | null
  failed_at: string | null
  created_at: string
}

function contactDisplayName(contact: ContactRow | undefined, fallback: string | null) {
  if (!contact) return fallback || 'Unknown contact'

  const fullName = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()
  return fullName || contact.email || contact.phone || fallback || 'Contact'
}

function memberDisplayName(member: Awaited<ReturnType<typeof getTeamMembers>>[number]) {
  return member.profile?.full_name?.trim() || member.profile?.email?.trim() || 'Team member'
}

function parseConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function loadConversationRows(
  membership: CurrentOrganizationMembership,
  selectedConversationId: string | null,
) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('communication_conversations')
    .select(
      'id,organization_id,contact_id,company_id,primary_channel,last_channel,participant_address,subject,status,assigned_membership_id,last_message_preview,last_message_at,last_inbound_at,last_outbound_at,last_direction,last_email_thread_id,created_at',
    )
    .eq('organization_id', membership.organization_id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(150)

  if (error) {
    throw new Error(`Failed to load conversations: ${error.message}`)
  }

  const rows = (data ?? []) as ConversationRow[]
  if (!selectedConversationId || rows.some((row) => row.id === selectedConversationId)) {
    return rows
  }

  const { data: selected, error: selectedError } = await supabase
    .from('communication_conversations')
    .select(
      'id,organization_id,contact_id,company_id,primary_channel,last_channel,participant_address,subject,status,assigned_membership_id,last_message_preview,last_message_at,last_inbound_at,last_outbound_at,last_direction,last_email_thread_id,created_at',
    )
    .eq('organization_id', membership.organization_id)
    .eq('id', selectedConversationId)
    .maybeSingle()

  if (selectedError) {
    throw new Error(`Failed to load the selected conversation: ${selectedError.message}`)
  }

  return selected ? [selected as ConversationRow, ...rows] : rows
}

export async function getCommunicationInbox(input: {
  membership: CurrentOrganizationMembership
  selectedConversationId?: string | null
}): Promise<ConversationInboxData> {
  const selectedConversationId = input.selectedConversationId?.trim() || null
  const supabase = await createClient()
  const rows = await loadConversationRows(input.membership, selectedConversationId)

  const contactIds = [...new Set(rows.map((row) => row.contact_id).filter((value): value is string => Boolean(value)))]
  const companyIds = [...new Set(rows.map((row) => row.company_id).filter((value): value is string => Boolean(value)))]
  const conversationIds = rows.map((row) => row.id)

  const [contactsResult, companiesResult, teamMembers, gmailResult] = await Promise.all([
    contactIds.length
      ? supabase
          .from('contacts')
          .select('id,first_name,last_name,email,phone,company_id')
          .eq('organization_id', input.membership.organization_id)
          .in('id', contactIds)
      : Promise.resolve({ data: [], error: null }),
    companyIds.length
      ? supabase
          .from('companies')
          .select('id,name')
          .eq('organization_id', input.membership.organization_id)
          .in('id', companyIds)
      : Promise.resolve({ data: [], error: null }),
    getTeamMembers(),
    supabase
      .from('organization_integrations')
      .select('enabled,status,config')
      .eq('organization_id', input.membership.organization_id)
      .eq('provider', 'gmail')
      .maybeSingle(),
  ])

  if (contactsResult.error) {
    throw new Error(`Failed to load conversation contacts: ${contactsResult.error.message}`)
  }
  if (companiesResult.error) {
    throw new Error(`Failed to load conversation companies: ${companiesResult.error.message}`)
  }
  if (gmailResult.error) {
    throw new Error(`Failed to load Gmail inbox status: ${gmailResult.error.message}`)
  }

  const contacts = new Map(
    ((contactsResult.data ?? []) as ContactRow[]).map((contact) => [contact.id, contact]),
  )
  const companies = new Map(
    ((companiesResult.data ?? []) as CompanyRow[]).map((company) => [company.id, company]),
  )
  const members = new Map(teamMembers.map((member) => [member.id, member]))
  const inboundCounts = new Map<string, number>()
  if (conversationIds.length) {
    const { data: unreadRows, error: unreadError } = await supabase.rpc(
      'get_communication_unread_counts',
      { p_organization_id: input.membership.organization_id },
    )

    if (unreadError) {
      throw new Error(`Failed to calculate unread conversations: ${unreadError.message}`)
    }

    for (const row of unreadRows ?? []) {
      const conversationId = optionalString(row.conversation_id)
      const count = Number(row.unread_count ?? 0)
      if (conversationId && Number.isFinite(count) && count > 0) {
        inboundCounts.set(conversationId, count)
      }
    }
  }

  const conversations: ConversationSummary[] = rows.map((row) => {
    const contact = row.contact_id ? contacts.get(row.contact_id) : undefined
    const company = row.company_id ? companies.get(row.company_id) : undefined
    const assigned = row.assigned_membership_id ? members.get(row.assigned_membership_id) : undefined

    return {
      id: row.id,
      organizationId: row.organization_id,
      contactId: row.contact_id,
      companyId: row.company_id,
      contactName: contactDisplayName(contact, row.participant_address),
      contactEmail: contact?.email ?? null,
      contactPhone: contact?.phone ?? null,
      companyName: company?.name ?? null,
      participantAddress: row.participant_address,
      primaryChannel: row.primary_channel,
      lastChannel: row.last_channel,
      subject: row.subject,
      status: row.status,
      assignedMembershipId: row.assigned_membership_id,
      assignedName: assigned ? memberDisplayName(assigned) : null,
      lastMessagePreview: row.last_message_preview ?? '',
      lastMessageAt: row.last_message_at,
      lastInboundAt: row.last_inbound_at,
      lastOutboundAt: row.last_outbound_at,
      lastDirection: row.last_direction,
      lastEmailThreadId: row.last_email_thread_id,
      unreadCount: inboundCounts.get(row.id) ?? 0,
    }
  })

  const selectedConversation = selectedConversationId
    ? conversations.find((conversation) => conversation.id === selectedConversationId) ?? null
    : conversations.find((conversation) => conversation.status === 'open') ?? conversations[0] ?? null

  let messages: ConversationMessage[] = []
  if (selectedConversation) {
    const { data, error } = await supabase
      .from('communication_messages')
      .select(
        'id,conversation_id,contact_id,channel,direction,recipient,sender,subject,body,provider,provider_message_id,provider_thread_id,status,error_message,sent_by,sent_at,received_at,delivered_at,failed_at,created_at',
      )
      .eq('organization_id', input.membership.organization_id)
      .eq('conversation_id', selectedConversation.id)
      .order('created_at', { ascending: false })
      .limit(300)

    if (error) {
      throw new Error(`Failed to load conversation messages: ${error.message}`)
    }

    messages = ([...((data ?? []) as MessageRow[])].reverse()).map((message) => {
      // sent_by stores auth.users.id, so resolve it against each membership's user_id.
      const senderByUser = message.sent_by
        ? teamMembers.find((member) => member.user_id === message.sent_by)
        : undefined

      return {
        id: message.id,
        conversationId: message.conversation_id ?? selectedConversation.id,
        contactId: message.contact_id,
        channel: message.channel,
        direction: message.direction,
        recipient: message.recipient,
        sender: message.sender,
        subject: message.subject,
        body: message.body,
        provider: message.provider,
        providerMessageId: message.provider_message_id,
        providerThreadId: message.provider_thread_id,
        status: message.status,
        errorMessage: message.error_message,
        sentBy: message.sent_by,
        sentByName: senderByUser ? memberDisplayName(senderByUser) : null,
        sentAt: message.sent_at,
        receivedAt: message.received_at,
        deliveredAt: message.delivered_at,
        failedAt: message.failed_at,
        createdAt: message.created_at,
      }
    })
  }

  const gmailConfig = parseConfig(gmailResult.data?.config)

  return {
    conversations,
    selectedConversation,
    messages,
    teamMembers: teamMembers.map((member) => ({
      id: member.id,
      name: memberDisplayName(member),
      email: member.profile?.email ?? null,
      role: member.role,
    })),
    unreadConversationCount: conversations.filter((conversation) => conversation.unreadCount > 0).length,
    canCompose: hasPermission(input.membership.role, 'communications.create'),
    canAssign: hasPermission(input.membership.role, 'communications.assign'),
    canManage: hasPermission(input.membership.role, 'communications.manage'),
    canReply: hasPermission(input.membership.role, 'communications.reply'),
    gmail: {
      connected: Boolean(gmailResult.data?.enabled && gmailResult.data?.status === 'connected'),
      connectedEmail: optionalString(gmailConfig.connected_email),
      watchStatus: optionalString(gmailConfig.gmail_watch_status),
      watchExpiration: optionalString(gmailConfig.gmail_watch_expiration),
      lastSyncAt: optionalString(gmailConfig.gmail_last_sync_at),
    },
  }
}

export async function getContactConversationPreviews(input: {
  organizationId: string
  contactId: string
  limit?: number
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('communication_conversations')
    .select('id,last_channel,subject,last_message_preview,last_message_at,last_direction,status')
    .eq('organization_id', input.organizationId)
    .eq('contact_id', input.contactId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(Math.max(1, Math.min(input.limit ?? 3, 10)))

  if (error) {
    throw new Error(`Failed to load contact conversations: ${error.message}`)
  }

  return (data ?? []).map((conversation) => ({
    id: String(conversation.id),
    channel: conversation.last_channel as ConversationChannel,
    subject: optionalString(conversation.subject),
    preview: optionalString(conversation.last_message_preview) ?? '',
    lastMessageAt: optionalString(conversation.last_message_at),
    direction: conversation.last_direction as ConversationDirection | null,
    status: conversation.status as 'open' | 'closed',
  }))
}

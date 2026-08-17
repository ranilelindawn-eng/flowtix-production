import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'

export type SmsSenderRequestStatus =
  | 'provider_submission_required'
  | 'provider_processing'
  | 'active'
  | 'action_required'
  | 'rejected'
  | 'cancelled'
  | 'replaced'

export type SmsSenderRequest = {
  id: string
  organization_id: string
  phone_number: string
  number_type: '10dlc' | 'toll_free'
  voice_provider_name: string
  authorized_contact_name: string
  authorized_contact_email: string
  company_website: string | null
  provider_account_number: string | null
  account_type: 'business' | 'residential' | null
  authorized_name_on_account: string | null
  billing_phone_number: string | null
  end_user_name: string | null
  phone_service_address: string | null
  tcr_campaign_id: string | null
  use_case: string
  sample_message: string
  opt_in_description: string
  ownership_authorized: boolean
  provider_split_authorized: boolean
  loa_file_name: string
  loa_storage_path: string
  invoice_file_name: string
  invoice_storage_path: string
  status: SmsSenderRequestStatus
  provider: 'signalwire'
  provider_number_id: string | null
  provider_status: string | null
  provider_note: string | null
  provider_submission_reference: string | null
  submitted_by: string | null
  submitted_at: string
  provider_submitted_at: string | null
  activated_at: string | null
  created_at: string
  updated_at: string
}

function webhookSecret() {
  const value =
    process.env.COMMUNICATION_WEBHOOK_SECRET?.trim() ||
    process.env.INTERNAL_JOB_WORKER_SECRET?.trim()
  if (!value) {
    throw new Error('COMMUNICATION_WEBHOOK_SECRET or INTERNAL_JOB_WORKER_SECRET is required.')
  }
  return value
}

function siteUrl() {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!value) throw new Error('NEXT_PUBLIC_SITE_URL is required for SMS webhooks.')
  return value.replace(/\/$/, '')
}

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue)
  const right = Buffer.from(rightValue)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function normalizeSmsNumber(value: string) {
  const normalized = value.trim().replace(/[\s().-]/g, '')
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error('Enter the company number in E.164 format, for example +14155550123.')
  }
  return normalized
}

export function inboundSmsWebhookToken(organizationId: string, phoneNumber: string) {
  return createHmac('sha256', webhookSecret())
    .update(`signalwire:inbound-sms:${organizationId}:${phoneNumber}`)
    .digest('base64url')
}

export function validateInboundSmsWebhookToken(input: {
  organizationId: string
  phoneNumber: string
  token: string
}) {
  return Boolean(input.token) && safeEqual(
    inboundSmsWebhookToken(input.organizationId, input.phoneNumber),
    input.token,
  )
}

export function inboundSmsWebhookUrl(organizationId: string, phoneNumber: string) {
  const url = new URL('/api/webhooks/communications/signalwire/inbound', siteUrl())
  url.searchParams.set('organizationId', organizationId)
  url.searchParams.set('number', phoneNumber)
  url.searchParams.set('token', inboundSmsWebhookToken(organizationId, phoneNumber))
  return url.toString()
}

export async function getActiveSmsSenderRequest(
  organizationId: string,
): Promise<SmsSenderRequest | null> {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin
    .from('organization_sms_sender_requests')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') return null
    throw new Error(`Unable to load the active SMS sender: ${error.message}`)
  }
  return data as SmsSenderRequest | null
}

export async function getOwnerSmsSenderRequests(
  organizationId: string,
): Promise<SmsSenderRequest[]> {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin
    .from('organization_sms_sender_requests')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return []
    throw new Error(`Unable to load SMS sender requests: ${error.message}`)
  }
  return (data ?? []) as SmsSenderRequest[]
}

export function smsSenderStatusLabel(status: SmsSenderRequestStatus) {
  switch (status) {
    case 'provider_submission_required':
      return 'Awaiting Flowtix submission'
    case 'provider_processing':
      return 'SignalWire processing'
    case 'active':
      return 'Active'
    case 'action_required':
      return 'Action required'
    case 'rejected':
      return 'Rejected'
    case 'cancelled':
      return 'Cancelled'
    case 'replaced':
      return 'Replaced'
  }
}

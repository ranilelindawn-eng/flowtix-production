import 'server-only'

import { decryptIntegrationSecret } from '@/lib/integrations/crypto'
import { requirePlatformPermission } from '@/lib/platform/auth'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'

export type PlatformSmsSenderRequest = {
  id: string
  organizationId: string
  phoneNumber: string
  numberType: string
  voiceProviderName: string
  authorizedContactName: string
  authorizedContactEmail: string
  companyWebsite: string | null
  providerAccountNumber: string | null
  accountType: string | null
  authorizedNameOnAccount: string | null
  billingPhoneNumber: string | null
  endUserName: string | null
  phoneServiceAddress: string | null
  tcrCampaignId: string | null
  useCase: string
  sampleMessage: string
  optInDescription: string
  loaFileName: string
  invoiceFileName: string
  status: string
  providerStatus: string | null
  providerNote: string | null
  providerSubmissionReference: string | null
  providerNumberId: string | null
  submittedAt: string
  providerSubmittedAt: string | null
  activatedAt: string | null
}

type Row = Record<string, unknown>
type CarrierSecret = { providerAccountPin?: unknown }

const stringValue = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

function parse(row: Row): PlatformSmsSenderRequest | null {
  const id = stringValue(row.id)
  const organizationId = stringValue(row.organization_id)
  const phoneNumber = stringValue(row.phone_number)
  const numberType = stringValue(row.number_type)
  const voiceProviderName = stringValue(row.voice_provider_name)
  const authorizedContactName = stringValue(row.authorized_contact_name)
  const authorizedContactEmail = stringValue(row.authorized_contact_email)
  const useCase = stringValue(row.use_case)
  const sampleMessage = stringValue(row.sample_message)
  const optInDescription = stringValue(row.opt_in_description)
  const loaFileName = stringValue(row.loa_file_name)
  const invoiceFileName = stringValue(row.invoice_file_name)
  const status = stringValue(row.status)
  const submittedAt = stringValue(row.submitted_at)

  if (
    !id ||
    !organizationId ||
    !phoneNumber ||
    !numberType ||
    !voiceProviderName ||
    !authorizedContactName ||
    !authorizedContactEmail ||
    !useCase ||
    !sampleMessage ||
    !optInDescription ||
    !loaFileName ||
    !invoiceFileName ||
    !status ||
    !submittedAt
  ) {
    return null
  }

  return {
    id,
    organizationId,
    phoneNumber,
    numberType,
    voiceProviderName,
    authorizedContactName,
    authorizedContactEmail,
    companyWebsite: stringValue(row.company_website),
    providerAccountNumber: stringValue(row.provider_account_number),
    accountType: stringValue(row.account_type),
    authorizedNameOnAccount: stringValue(row.authorized_name_on_account),
    billingPhoneNumber: stringValue(row.billing_phone_number),
    endUserName: stringValue(row.end_user_name),
    phoneServiceAddress: stringValue(row.phone_service_address),
    tcrCampaignId: stringValue(row.tcr_campaign_id),
    useCase,
    sampleMessage,
    optInDescription,
    loaFileName,
    invoiceFileName,
    status,
    providerStatus: stringValue(row.provider_status),
    providerNote: stringValue(row.provider_note),
    providerSubmissionReference: stringValue(row.provider_submission_reference),
    providerNumberId: stringValue(row.provider_number_id),
    submittedAt,
    providerSubmittedAt: stringValue(row.provider_submitted_at),
    activatedAt: stringValue(row.activated_at),
  }
}

export async function getPlatformSmsSenderRequests(organizationId: string) {
  await requirePlatformPermission('platform.telephony.manage')
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin
    .from('organization_sms_sender_requests')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return []
    throw new Error(`Unable to load company SMS provisioning requests: ${error.message}`)
  }

  return (data ?? []).flatMap((value) => {
    const parsed = parse(value as Row)
    return parsed ? [parsed] : []
  })
}

export async function getPlatformSmsSenderDocument(input: {
  requestId: string
  document: 'loa' | 'invoice'
}) {
  await requirePlatformPermission('platform.telephony.manage')
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin
    .from('organization_sms_sender_requests')
    .select('loa_storage_path,loa_file_name,invoice_storage_path,invoice_file_name')
    .eq('id', input.requestId)
    .maybeSingle()

  if (error) throw new Error(`Unable to load provisioning document: ${error.message}`)
  if (!data) return null

  return input.document === 'loa'
    ? { path: data.loa_storage_path, fileName: data.loa_file_name }
    : { path: data.invoice_storage_path, fileName: data.invoice_file_name }
}

export async function getPlatformSmsSenderProviderPin(requestId: string) {
  await requirePlatformPermission('platform.telephony.manage')
  const admin = createTelephonyAdminClient()

  const { data, error } = await admin
    .from('organization_sms_sender_request_secrets')
    .select('encrypted_credentials')
    .eq('request_id', requestId)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') return null
    throw new Error(`Unable to load encrypted carrier credentials: ${error.message}`)
  }
  if (!data?.encrypted_credentials) return null

  const decrypted = decryptIntegrationSecret<CarrierSecret>(data.encrypted_credentials)
  return typeof decrypted.providerAccountPin === 'string' && decrypted.providerAccountPin.trim()
    ? decrypted.providerAccountPin.trim()
    : null
}

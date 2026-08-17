import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

export type EnterpriseOnboardingStatus =
  | 'inquiry'
  | 'qualified'
  | 'proposal'
  | 'awaiting_payment'
  | 'payment_confirmed'
  | 'onboarding'
  | 'ready'
  | 'active'
  | 'suspended'
  | 'closed'

export type EnterprisePaymentStatus =
  | 'not_started'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'partially_refunded'

export type PlatformEnterpriseSummary = {
  id: string
  contactName: string
  contactEmail: string
  companyName: string | null
  organizationId: string | null
  organizationName: string | null
  onboardingStatus: EnterpriseOnboardingStatus
  proposedMonthlyPriceCents: number | null
  paymentStatus: EnterprisePaymentStatus
  paymongoCheckoutId: string | null
  paymongoPaymentId: string | null
  createdAt: string
  updatedAt: string
}

export type PlatformEnterpriseDetail = PlatformEnterpriseSummary & {
  inquiryId: string | null
  inquiryMessage: string | null
  inquiryCreatedAt: string | null
  currentPlanCode: string | null
  subscriptionStatus: string | null
  currentPeriodEnd: string | null
  paidPeriodActive: boolean
  currency: 'PHP'
  customMemberLimit: number | null
  customContactLimit: number | null
  customActiveCampaignLimit: number | null
  customActiveSequenceLimit: number | null
  customStorageBytes: number | null
  customRecordingRetentionDays: number | null
  customAiRequestsPerMonth: number | null
  customTranscriptionMinutesPerMonth: number | null
  contractReferenceNotes: string | null
  paymongoCheckoutUrl: string | null
  checkoutExpiresAt: string | null
  paymentAmountCents: number | null
  paidAt: string | null
  lastAppliedPaymentId: string | null
  activatedAt: string | null
  suspendedAt: string | null
}

export type PlatformEnterpriseDirectory = {
  items: PlatformEnterpriseSummary[]
  total: number
  limit: number
  offset: number
}

type Row = Record<string, unknown>

function record(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function number(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value)
  return null
}

function onboarding(value: unknown): EnterpriseOnboardingStatus {
  switch (value) {
    case 'qualified':
    case 'proposal':
    case 'awaiting_payment':
    case 'payment_confirmed':
    case 'onboarding':
    case 'ready':
    case 'active':
    case 'suspended':
    case 'closed':
      return value
    default:
      return 'inquiry'
  }
}

function payment(value: unknown): EnterprisePaymentStatus {
  switch (value) {
    case 'pending':
    case 'paid':
    case 'failed':
    case 'expired':
    case 'refunded':
    case 'partially_refunded':
      return value
    default:
      return 'not_started'
  }
}

function parseSummary(value: unknown): PlatformEnterpriseSummary | null {
  if (!record(value)) return null

  const id = string(value.id)
  const contactName = string(value.contactName)
  const contactEmail = string(value.contactEmail)
  const createdAt = string(value.createdAt)
  const updatedAt = string(value.updatedAt)

  if (!id || !contactName || !contactEmail || !createdAt || !updatedAt) {
    return null
  }

  return {
    id,
    contactName,
    contactEmail,
    companyName: string(value.companyName),
    organizationId: string(value.organizationId),
    organizationName: string(value.organizationName),
    onboardingStatus: onboarding(value.onboardingStatus),
    proposedMonthlyPriceCents: number(value.proposedMonthlyPriceCents),
    paymentStatus: payment(value.paymentStatus),
    paymongoCheckoutId: string(value.paymongoCheckoutId),
    paymongoPaymentId: string(value.paymongoPaymentId),
    createdAt,
    updatedAt,
  }
}

export async function getPlatformEnterpriseAccounts(input?: {
  search?: string
  status?: EnterpriseOnboardingStatus | 'all'
  limit?: number
  offset?: number
}): Promise<PlatformEnterpriseDirectory> {
  await requirePlatformPermission('platform.enterprise.manage')

  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100)
  const offset = Math.max(input?.offset ?? 0, 0)
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('platform_enterprise_directory', {
    p_search: input?.search?.trim() || null,
    p_status:
      !input?.status || input.status === 'all'
        ? null
        : input.status,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) {
    throw new Error(`Unable to load Enterprise accounts: ${error.message}`)
  }

  if (!record(data)) {
    return { items: [], total: 0, limit, offset }
  }

  const rows: unknown[] = Array.isArray(data.items) ? data.items : []

  return {
    items: rows.flatMap((row) => {
      const parsed = parseSummary(row)
      return parsed ? [parsed] : []
    }),
    total: number(data.total) ?? 0,
    limit: number(data.limit) ?? limit,
    offset: number(data.offset) ?? offset,
  }
}

export async function getPlatformEnterpriseAccount(
  accountId: string,
): Promise<PlatformEnterpriseDetail | null> {
  await requirePlatformPermission('platform.enterprise.manage')

  const normalized = accountId.trim()
  if (!normalized) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_enterprise_detail', {
    p_account_id: normalized,
  })

  if (error) {
    throw new Error(`Unable to load Enterprise account: ${error.message}`)
  }

  const summary = parseSummary(data)
  if (!summary || !record(data)) return null

  return {
    ...summary,
    inquiryId: string(data.inquiryId),
    inquiryMessage: string(data.inquiryMessage),
    inquiryCreatedAt: string(data.inquiryCreatedAt),
    currentPlanCode: string(data.currentPlanCode),
    subscriptionStatus: string(data.subscriptionStatus),
    currentPeriodEnd: string(data.currentPeriodEnd),
    paidPeriodActive: data.paidPeriodActive === true,
    currency: 'PHP',
    customMemberLimit: number(data.customMemberLimit),
    customContactLimit: number(data.customContactLimit),
    customActiveCampaignLimit: number(data.customActiveCampaignLimit),
    customActiveSequenceLimit: number(data.customActiveSequenceLimit),
    customStorageBytes: number(data.customStorageBytes),
    customRecordingRetentionDays: number(data.customRecordingRetentionDays),
    customAiRequestsPerMonth: number(data.customAiRequestsPerMonth),
    customTranscriptionMinutesPerMonth: number(data.customTranscriptionMinutesPerMonth),
    contractReferenceNotes: string(data.contractReferenceNotes),
    paymongoCheckoutUrl: string(data.paymongoCheckoutUrl),
    checkoutExpiresAt: string(data.checkoutExpiresAt),
    paymentAmountCents: number(data.paymentAmountCents),
    paidAt: string(data.paidAt),
    lastAppliedPaymentId: string(data.lastAppliedPaymentId),
    activatedAt: string(data.activatedAt),
    suspendedAt: string(data.suspendedAt),
  }
}

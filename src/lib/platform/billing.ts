import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type Row = Record<string, unknown>

const record = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const string = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const number = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return 0
}

const boolean = (value: unknown): boolean => value === true

export type PlatformBillingMetrics = {
  revenueThisMonthCents: number
  paidPaymentsThisMonth: number
  failedPayments: number
  failedWebhookEvents: number
  deadLetteredEvents: number
  openInvoices: number
  amountDueCents: number
  openUsageStatements: number
}

export type PlatformBillingEvent = {
  id: string
  organizationId: string | null
  organizationName: string | null
  providerEventId: string
  eventType: string
  livemode: boolean | null
  resourceType: string | null
  resourceId: string | null
  checkoutId: string | null
  paymentId: string | null
  planCode: string | null
  status: string
  processingAttempts: number
  ignoredReason: string | null
  errorMessage: string | null
  nextRetryAt: string | null
  deadLetteredAt: string | null
  replayedAt: string | null
  receivedAt: string
  processedAt: string | null
}

export type PlatformBillingAttempt = {
  id: string
  attemptNumber: number
  outcome: string
  errorMessage: string | null
  durationMs: number | null
  createdAt: string
}

export type PlatformBillingEventDetail = PlatformBillingEvent & {
  signatureTimestamp: string | null
  providerPayloadStored: boolean
  attempts: PlatformBillingAttempt[]
}

export type PlatformBillingPayment = {
  id: string
  organizationId: string
  organizationName: string
  subscriptionId: string | null
  providerPaymentId: string | null
  providerCheckoutId: string | null
  providerEventId: string | null
  planCode: string | null
  status: string
  amountCents: number | null
  currency: string
  failureCode: string | null
  failureMessage: string | null
  paidAt: string | null
  refundedAt: string | null
  createdAt: string
}

export type PlatformBillingInvoice = {
  id: string
  organizationId: string
  organizationName: string
  subscriptionId: string | null
  paymentId: string | null
  invoiceNumber: string
  status: string
  currency: string
  subtotalCents: number
  taxCents: number
  totalCents: number
  amountPaidCents: number
  amountDueCents: number
  periodStart: string | null
  periodEnd: string | null
  dueAt: string | null
  paidAt: string | null
  createdAt: string
}

export type PlatformBillingUsageStatement = {
  id: string
  organizationId: string
  organizationName: string
  subscriptionId: string | null
  periodStart: string
  periodEnd: string
  status: string
  currency: string
  subtotalCents: number
  invoiceId: string | null
  finalizedAt: string | null
  createdAt: string
}

export type PlatformBillingReconciliation = {
  organizationId: string
  organizationName: string
  subscriptionExists: boolean
  subscriptionStatus: string | null
  billingProvider: string | null
  missingInvoices: number
  invoiceAmountMismatches: number
  orphanInvoices: number
  orphanUsageStatements: number
  duplicateCheckoutReferences: number
  nonPayMongoPayments: number
  nonPhpRecords: number
  expiredPendingPayments: number
  healthy: boolean
  checkedAt: string
}

export type PlatformBillingDirectory<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
}

function directory<T>(
  value: unknown,
  parser: (row: unknown) => T | null,
  fallbackLimit: number,
): PlatformBillingDirectory<T> {
  if (!record(value)) {
    return { items: [], total: 0, limit: fallbackLimit, offset: 0 }
  }
  const rows: unknown[] = Array.isArray(value.items) ? value.items : []
  return {
    items: rows.flatMap((row) => {
      const parsed = parser(row)
      return parsed ? [parsed] : []
    }),
    total: number(value.total),
    limit: number(value.limit) || fallbackLimit,
    offset: number(value.offset),
  }
}

function parseEvent(value: unknown): PlatformBillingEvent | null {
  if (!record(value)) return null
  const id = string(value.id)
  const providerEventId = string(value.providerEventId)
  const eventType = string(value.eventType)
  const status = string(value.status)
  const receivedAt = string(value.receivedAt)
  if (!id || !providerEventId || !eventType || !status || !receivedAt) {
    return null
  }
  return {
    id,
    organizationId: string(value.organizationId),
    organizationName: string(value.organizationName),
    providerEventId,
    eventType,
    livemode:
      typeof value.livemode === 'boolean' ? value.livemode : null,
    resourceType: string(value.resourceType),
    resourceId: string(value.resourceId),
    checkoutId: string(value.checkoutId),
    paymentId: string(value.paymentId),
    planCode: string(value.planCode),
    status,
    processingAttempts: number(value.processingAttempts),
    ignoredReason: string(value.ignoredReason),
    errorMessage: string(value.errorMessage),
    nextRetryAt: string(value.nextRetryAt),
    deadLetteredAt: string(value.deadLetteredAt),
    replayedAt: string(value.replayedAt),
    receivedAt,
    processedAt: string(value.processedAt),
  }
}

function parsePayment(value: unknown): PlatformBillingPayment | null {
  if (!record(value)) return null
  const id = string(value.id)
  const organizationId = string(value.organizationId)
  const organizationName = string(value.organizationName)
  const status = string(value.status)
  const currency = string(value.currency)
  const createdAt = string(value.createdAt)
  if (!id || !organizationId || !organizationName || !status || !currency || !createdAt) {
    return null
  }
  return {
    id,
    organizationId,
    organizationName,
    subscriptionId: string(value.subscriptionId),
    providerPaymentId: string(value.providerPaymentId),
    providerCheckoutId: string(value.providerCheckoutId),
    providerEventId: string(value.providerEventId),
    planCode: string(value.planCode),
    status,
    amountCents:
      value.amountCents === null || value.amountCents === undefined
        ? null
        : number(value.amountCents),
    currency,
    failureCode: string(value.failureCode),
    failureMessage: string(value.failureMessage),
    paidAt: string(value.paidAt),
    refundedAt: string(value.refundedAt),
    createdAt,
  }
}

function parseInvoice(value: unknown): PlatformBillingInvoice | null {
  if (!record(value)) return null
  const id = string(value.id)
  const organizationId = string(value.organizationId)
  const organizationName = string(value.organizationName)
  const invoiceNumber = string(value.invoiceNumber)
  const status = string(value.status)
  const currency = string(value.currency)
  const createdAt = string(value.createdAt)
  if (!id || !organizationId || !organizationName || !invoiceNumber || !status || !currency || !createdAt) {
    return null
  }
  return {
    id,
    organizationId,
    organizationName,
    subscriptionId: string(value.subscriptionId),
    paymentId: string(value.paymentId),
    invoiceNumber,
    status,
    currency,
    subtotalCents: number(value.subtotalCents),
    taxCents: number(value.taxCents),
    totalCents: number(value.totalCents),
    amountPaidCents: number(value.amountPaidCents),
    amountDueCents: number(value.amountDueCents),
    periodStart: string(value.periodStart),
    periodEnd: string(value.periodEnd),
    dueAt: string(value.dueAt),
    paidAt: string(value.paidAt),
    createdAt,
  }
}

function parseUsage(value: unknown): PlatformBillingUsageStatement | null {
  if (!record(value)) return null
  const id = string(value.id)
  const organizationId = string(value.organizationId)
  const organizationName = string(value.organizationName)
  const periodStart = string(value.periodStart)
  const periodEnd = string(value.periodEnd)
  const status = string(value.status)
  const currency = string(value.currency)
  const createdAt = string(value.createdAt)
  if (!id || !organizationId || !organizationName || !periodStart || !periodEnd || !status || !currency || !createdAt) {
    return null
  }
  return {
    id,
    organizationId,
    organizationName,
    subscriptionId: string(value.subscriptionId),
    periodStart,
    periodEnd,
    status,
    currency,
    subtotalCents: number(value.subtotalCents),
    invoiceId: string(value.invoiceId),
    finalizedAt: string(value.finalizedAt),
    createdAt,
  }
}

function parseReconciliation(value: unknown): PlatformBillingReconciliation | null {
  if (!record(value)) return null
  const organizationId = string(value.organizationId)
  const organizationName = string(value.organizationName)
  const checkedAt = string(value.checkedAt)
  if (!organizationId || !organizationName || !checkedAt) return null
  return {
    organizationId,
    organizationName,
    subscriptionExists: boolean(value.subscriptionExists),
    subscriptionStatus: string(value.subscriptionStatus),
    billingProvider: string(value.billingProvider),
    missingInvoices: number(value.missingInvoices),
    invoiceAmountMismatches: number(value.invoiceAmountMismatches),
    orphanInvoices: number(value.orphanInvoices),
    orphanUsageStatements: number(value.orphanUsageStatements),
    duplicateCheckoutReferences: number(value.duplicateCheckoutReferences),
    nonPayMongoPayments: number(value.nonPayMongoPayments),
    nonPhpRecords: number(value.nonPhpRecords),
    expiredPendingPayments: number(value.expiredPendingPayments),
    healthy: boolean(value.healthy),
    checkedAt,
  }
}

async function callDirectory<T>(
  rpc: string,
  input: {
    search?: string
    status?: string
    limit?: number
    offset?: number
  },
  parser: (row: unknown) => T | null,
): Promise<PlatformBillingDirectory<T>> {
  await requirePlatformPermission('platform.billing.view')
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  const offset = Math.max(input.offset ?? 0, 0)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(rpc, {
    p_search: input.search?.trim() || null,
    p_status: !input.status || input.status === 'all' ? null : input.status,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw new Error(`Unable to load platform billing data: ${error.message}`)
  return directory(data, parser, limit)
}

export async function getPlatformBillingMetrics(): Promise<PlatformBillingMetrics> {
  await requirePlatformPermission('platform.billing.view')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_billing_metrics')
  if (error) throw new Error(`Unable to load billing metrics: ${error.message}`)
  const value = record(data) ? data : {}
  return {
    revenueThisMonthCents: number(value.revenueThisMonthCents),
    paidPaymentsThisMonth: number(value.paidPaymentsThisMonth),
    failedPayments: number(value.failedPayments),
    failedWebhookEvents: number(value.failedWebhookEvents),
    deadLetteredEvents: number(value.deadLetteredEvents),
    openInvoices: number(value.openInvoices),
    amountDueCents: number(value.amountDueCents),
    openUsageStatements: number(value.openUsageStatements),
  }
}

export function getPlatformBillingEvents(input: {
  search?: string
  status?: string
  limit?: number
  offset?: number
}) {
  return callDirectory('platform_billing_event_directory', input, parseEvent)
}

export function getPlatformBillingPayments(input: {
  search?: string
  status?: string
  limit?: number
  offset?: number
}) {
  return callDirectory('platform_billing_payment_directory', input, parsePayment)
}

export function getPlatformBillingInvoices(input: {
  search?: string
  status?: string
  limit?: number
  offset?: number
}) {
  return callDirectory('platform_billing_invoice_directory', input, parseInvoice)
}

export function getPlatformBillingUsage(input: {
  search?: string
  status?: string
  limit?: number
  offset?: number
}) {
  return callDirectory('platform_billing_usage_directory', input, parseUsage)
}

export function getPlatformBillingReconciliations(input: {
  search?: string
  status?: string
  limit?: number
  offset?: number
}) {
  return callDirectory(
    'platform_billing_reconciliation_directory',
    input,
    parseReconciliation,
  )
}

export async function getPlatformBillingEvent(
  eventId: string,
): Promise<PlatformBillingEventDetail | null> {
  await requirePlatformPermission('platform.billing.view')
  const normalized = eventId.trim()
  if (!normalized) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_billing_event_detail',
    { p_event_id: normalized },
  )
  if (error) {
    throw new Error(`Unable to load billing event: ${error.message}`)
  }
  if (!record(data)) return null

  const parsed = parseEvent(data)
  if (!parsed) return null
  const rows: unknown[] = Array.isArray(data.attempts) ? data.attempts : []

  return {
    ...parsed,
    signatureTimestamp: string(data.signatureTimestamp),
    providerPayloadStored: boolean(data.providerPayloadStored),
    attempts: rows.flatMap((row) => {
      if (!record(row)) return []
      const id = string(row.id)
      const outcome = string(row.outcome)
      const createdAt = string(row.createdAt)
      if (!id || !outcome || !createdAt) return []
      return [{
        id,
        attemptNumber: number(row.attemptNumber),
        outcome,
        errorMessage: string(row.errorMessage),
        durationMs:
          row.durationMs === null || row.durationMs === undefined
            ? null
            : number(row.durationMs),
        createdAt,
      }]
    }),
  }
}

import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type Row = Record<string, unknown>

const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return 0
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const asBoolean = (value: unknown): boolean => value === true

export type PayMongoAcceptanceIssue = {
  key: string
  severity: 'warning' | 'critical'
  count: number
  message: string
}

export type PayMongoAcceptanceReport = {
  healthy: boolean
  score: number
  checkedAt: string
  subscriptions: {
    total: number
    active: number
    pending: number
    pastDue: number
    nonPayMongo: number
    expiredPendingCheckouts: number
    pendingWithoutCheckout: number
  }
  payments: {
    total: number
    paid: number
    failed: number
    pending: number
    paidMissingInvoice: number
    invoiceAmountMismatches: number
  }
  webhooks: {
    total: number
    processed: number
    failed: number
    ignored: number
    deadLettered: number
    processedLast24Hours: number
    paidEventsWithoutPaymentLedger: number
  }
  invoices: {
    total: number
    paid: number
    open: number
  }
  usage: {
    openStatements: number
    finalizedStatements: number
    invoicedStatements: number
  }
  lifecycle: {
    events: number
    recentEvents24Hours: number
  }
  issues: PayMongoAcceptanceIssue[]
}

function emptyReport(): PayMongoAcceptanceReport {
  return {
    healthy: false,
    score: 0,
    checkedAt: new Date(0).toISOString(),
    subscriptions: {
      total: 0,
      active: 0,
      pending: 0,
      pastDue: 0,
      nonPayMongo: 0,
      expiredPendingCheckouts: 0,
      pendingWithoutCheckout: 0,
    },
    payments: {
      total: 0,
      paid: 0,
      failed: 0,
      pending: 0,
      paidMissingInvoice: 0,
      invoiceAmountMismatches: 0,
    },
    webhooks: {
      total: 0,
      processed: 0,
      failed: 0,
      ignored: 0,
      deadLettered: 0,
      processedLast24Hours: 0,
      paidEventsWithoutPaymentLedger: 0,
    },
    invoices: {
      total: 0,
      paid: 0,
      open: 0,
    },
    usage: {
      openStatements: 0,
      finalizedStatements: 0,
      invoicedStatements: 0,
    },
    lifecycle: {
      events: 0,
      recentEvents24Hours: 0,
    },
    issues: [],
  }
}

function nestedNumber(
  source: Row,
  section: string,
  key: string,
): number {
  const nested = source[section]
  return isRecord(nested) ? asNumber(nested[key]) : 0
}

export async function getPayMongoAcceptanceReport(): Promise<PayMongoAcceptanceReport> {
  await requirePlatformPermission('platform.billing.view')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_paymongo_acceptance_report',
  )

  if (error) {
    throw new Error(
      `Unable to run PayMongo acceptance validation: ${error.message}`,
    )
  }

  if (!isRecord(data)) return emptyReport()

  const issueRows: unknown[] = Array.isArray(data.issues)
    ? data.issues
    : []

  const issues: PayMongoAcceptanceIssue[] = issueRows.flatMap((value) => {
    if (!isRecord(value)) return []

    const key = asString(value.key)
    const severityValue = asString(value.severity)
    const message = asString(value.message)

    if (
      !key ||
      (severityValue !== 'warning' && severityValue !== 'critical') ||
      !message
    ) {
      return []
    }

    const severity: PayMongoAcceptanceIssue['severity'] =
      severityValue

    return [{
      key,
      severity,
      count: asNumber(value.count),
      message,
    }]
  })

  return {
    healthy: asBoolean(data.healthy),
    score: asNumber(data.score),
    checkedAt:
      asString(data.checkedAt) ?? new Date(0).toISOString(),
    subscriptions: {
      total: nestedNumber(data, 'subscriptions', 'total'),
      active: nestedNumber(data, 'subscriptions', 'active'),
      pending: nestedNumber(data, 'subscriptions', 'pending'),
      pastDue: nestedNumber(data, 'subscriptions', 'pastDue'),
      nonPayMongo: nestedNumber(data, 'subscriptions', 'nonPayMongo'),
      expiredPendingCheckouts: nestedNumber(
        data,
        'subscriptions',
        'expiredPendingCheckouts',
      ),
      pendingWithoutCheckout: nestedNumber(
        data,
        'subscriptions',
        'pendingWithoutCheckout',
      ),
    },
    payments: {
      total: nestedNumber(data, 'payments', 'total'),
      paid: nestedNumber(data, 'payments', 'paid'),
      failed: nestedNumber(data, 'payments', 'failed'),
      pending: nestedNumber(data, 'payments', 'pending'),
      paidMissingInvoice: nestedNumber(
        data,
        'payments',
        'paidMissingInvoice',
      ),
      invoiceAmountMismatches: nestedNumber(
        data,
        'payments',
        'invoiceAmountMismatches',
      ),
    },
    webhooks: {
      total: nestedNumber(data, 'webhooks', 'total'),
      processed: nestedNumber(data, 'webhooks', 'processed'),
      failed: nestedNumber(data, 'webhooks', 'failed'),
      ignored: nestedNumber(data, 'webhooks', 'ignored'),
      deadLettered: nestedNumber(data, 'webhooks', 'deadLettered'),
      processedLast24Hours: nestedNumber(
        data,
        'webhooks',
        'processedLast24Hours',
      ),
      paidEventsWithoutPaymentLedger: nestedNumber(
        data,
        'webhooks',
        'paidEventsWithoutPaymentLedger',
      ),
    },
    invoices: {
      total: nestedNumber(data, 'invoices', 'total'),
      paid: nestedNumber(data, 'invoices', 'paid'),
      open: nestedNumber(data, 'invoices', 'open'),
    },
    usage: {
      openStatements: nestedNumber(data, 'usage', 'openStatements'),
      finalizedStatements: nestedNumber(
        data,
        'usage',
        'finalizedStatements',
      ),
      invoicedStatements: nestedNumber(
        data,
        'usage',
        'invoicedStatements',
      ),
    },
    lifecycle: {
      events: nestedNumber(data, 'lifecycle', 'events'),
      recentEvents24Hours: nestedNumber(
        data,
        'lifecycle',
        'recentEvents24Hours',
      ),
    },
    issues,
  }
}

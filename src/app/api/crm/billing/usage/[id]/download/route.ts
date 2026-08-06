import { getUsageBillingStatementById } from '@/lib/billing/platform'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return new Response('Invalid statement ID.', { status: 400 })

  try {
    const statement = await getUsageBillingStatementById(id)
    if (!statement) return new Response('Usage statement not found.', { status: 404 })

    const rows: unknown[][] = [
      ['Statement ID', statement.id],
      ['Status', statement.status],
      ['Currency', statement.currency],
      ['Subtotal', statement.subtotal],
      ['Period start', statement.period_start],
      ['Period end', statement.period_end],
      ['Invoice ID', statement.invoice_id ?? ''],
      ['Created at', statement.created_at],
      [],
      ['Line items JSON', JSON.stringify(statement.line_items)],
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
    const filename = `flowtix-usage-${statement.period_start}-${statement.period_end}.csv`

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Unable to download usage statement.', { status: 403 })
  }
}

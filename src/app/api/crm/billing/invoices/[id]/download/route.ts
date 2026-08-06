import { getInvoiceById } from '@/lib/billing/platform'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return new Response('Invalid invoice ID.', { status: 400 })

  try {
    const invoice = await getInvoiceById(id)
    if (!invoice) return new Response('Invoice not found.', { status: 404 })

    const rows: unknown[][] = [
      ['Invoice number', invoice.invoice_number],
      ['Status', invoice.status],
      ['Currency', invoice.currency],
      ['Subtotal', invoice.subtotal],
      ['Tax', invoice.tax],
      ['Total', invoice.total],
      ['Amount paid', invoice.amount_paid],
      ['Amount due', invoice.amount_due],
      ['Period start', invoice.period_start ?? ''],
      ['Period end', invoice.period_end ?? ''],
      ['Due at', invoice.due_at ?? ''],
      ['Paid at', invoice.paid_at ?? ''],
      ['Created at', invoice.created_at],
      [],
      ['Line items JSON', JSON.stringify(invoice.line_items)],
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
    const filename = `${invoice.invoice_number.replace(/[^a-z0-9_-]/gi, '_')}.csv`

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Unable to download invoice.', { status: 403 })
  }
}

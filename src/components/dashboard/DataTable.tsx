import Link from 'next/link'
import type { ReactNode } from 'react'

type DataTableProps = {
  title: string
  description?: string
  columns: string[]
  rows: ReactNode[][]
  emptyTitle?: string
  emptyDescription?: string
  actionHref?: string
  actionLabel?: string
}

function normalizeBadgeValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

function getBadgeStyles(value: string): string | null {
  const normalizedValue = normalizeBadgeValue(value)

  const styles: Record<string, string> = {
    active:
      'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    connected:
      'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    completed:
      'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    answered:
      'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    success:
      'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',

    pending:
      'border-amber-400/20 bg-amber-400/10 text-amber-300',
    queued:
      'border-amber-400/20 bg-amber-400/10 text-amber-300',
    ringing:
      'border-amber-400/20 bg-amber-400/10 text-amber-300',
    busy:
      'border-amber-400/20 bg-amber-400/10 text-amber-300',

    failed:
      'border-rose-400/20 bg-rose-400/10 text-rose-300',
    missed:
      'border-rose-400/20 bg-rose-400/10 text-rose-300',
    declined:
      'border-rose-400/20 bg-rose-400/10 text-rose-300',
    cancelled:
      'border-rose-400/20 bg-rose-400/10 text-rose-300',

    inactive:
      'border-slate-400/20 bg-slate-400/10 text-slate-300',
    archived:
      'border-slate-400/20 bg-slate-400/10 text-slate-300',
    unknown:
      'border-slate-400/20 bg-slate-400/10 text-slate-300',

    inbound:
      'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
    outbound:
      'border-blue-400/20 bg-blue-400/10 text-blue-300',

    live:
      'border-violet-400/20 bg-violet-400/10 text-violet-300',
    draft:
      'border-violet-400/20 bg-violet-400/10 text-violet-300',
    paused:
      'border-orange-400/20 bg-orange-400/10 text-orange-300',
  }

  return styles[normalizedValue] ?? null
}

function renderCell(cell: ReactNode): ReactNode {
  if (typeof cell !== 'string') {
    return cell
  }

  const badgeStyles = getBadgeStyles(cell)

  if (!badgeStyles) {
    return (
      <span className="text-slate-300">
        {cell}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${badgeStyles}`}
    >
      {cell}
    </span>
  )
}

export default function DataTable({
  title,
  description,
  columns,
  rows,
  emptyTitle = 'No data found',
  emptyDescription = 'Records will appear here once they become available.',
  actionHref,
  actionLabel,
}: DataTableProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.65)]">
      <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {title}
          </h2>

          {description ? (
            <p className="mt-1 text-sm leading-6 text-slate-400">
              {description}
            </p>
          ) : null}
        </div>

        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex w-fit items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-cyan-400/20 hover:bg-cyan-400/10 hover:text-cyan-200"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full table-auto text-left text-sm">
          <thead className="bg-[#07111F]/70">
            <tr className="border-b border-white/10">
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-6 py-14 text-center"
                >
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg text-slate-400">
                      —
                    </div>

                    <p className="mt-4 font-semibold text-white">
                      {emptyTitle}
                    </p>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {emptyDescription}
                    </p>

                    {actionHref && actionLabel ? (
                      <Link
                        href={actionHref}
                        className="mt-5 inline-flex items-center justify-center rounded-2xl bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
                      >
                        {actionLabel}
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr
                  key={`row-${rowIndex}`}
                  className="group transition duration-200 hover:bg-white/[0.035]"
                >
                  {columns.map((_, cellIndex) => (
                    <td
                      key={`cell-${rowIndex}-${cellIndex}`}
                      className="whitespace-nowrap px-6 py-4 align-middle"
                    >
                      {renderCell(row[cellIndex] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 ? (
        <div className="border-t border-white/10 px-6 py-4">
          <p className="text-xs text-slate-500">
            Showing {rows.length}{' '}
            {rows.length === 1 ? 'record' : 'records'}
          </p>
        </div>
      ) : null}
    </section>
  )
}
'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
} from 'lucide-react'

type CsvRow = Record<string, string>

type ImportResult = {
  imported: number
  duplicates: number
  invalid: number
  total: number
  errors: Array<{ row: number; reason: string }>
}

const aliases: Record<string, string[]> = {
  first_name: [
    'first name',
    'firstname',
    'first_name',
    'given name',
  ],
  last_name: [
    'last name',
    'lastname',
    'last_name',
    'surname',
    'family name',
  ],
  preferred_name: [
    'preferred name',
    'preferred_name',
    'nickname',
  ],
  email: ['email', 'email address', 'e-mail'],
  phone: [
    'phone',
    'phone number',
    'telephone',
    'primary phone',
  ],
  mobile: ['mobile', 'mobile phone', 'cell', 'cell phone'],
  company: [
    'company',
    'company name',
    'organization',
    'account',
  ],
  title: ['title', 'job title', 'position'],
  status: ['status', 'contact status'],
  lifecycle_stage: [
    'lifecycle stage',
    'lifecycle_stage',
    'stage',
  ],
  source: ['source', 'lead source'],
  lead_score: ['lead score', 'lead_score', 'score'],
  timezone: ['timezone', 'time zone'],
  locale: ['locale', 'language locale'],
  do_not_email: [
    'do not email',
    'do_not_email',
    'no email',
  ],
  do_not_sms: [
    'do not sms',
    'do_not_sms',
    'no sms',
  ],
  do_not_call: [
    'do not call',
    'do_not_call',
    'no call',
  ],
  next_follow_up_at: [
    'next follow up at',
    'next_follow_up_at',
    'follow up at',
    'follow-up at',
  ],
  tags: ['tags', 'tag', 'labels'],
  notes: ['notes', 'note', 'description', 'comments'],
  assigned_team_member_email: [
    'assigned team member email',
    'assigned_team_member_email',
    'assigned member email',
    'team member email',
    'assigned agent email',
    'assigned_agent_email',
    'agent email',
    'owner email',
    'assignee email',
  ],
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"' && quoted && next === '"') {
      field += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(field.trim())
      field = ''
    } else if (
      (char === '\n' || char === '\r') &&
      !quoted
    ) {
      if (char === '\r' && next === '\n') {
        index += 1
      }

      row.push(field.trim())

      if (row.some(Boolean)) {
        rows.push(row)
      }

      row = []
      field = ''
    } else {
      field += char
    }
  }

  row.push(field.trim())

  if (row.some(Boolean)) {
    rows.push(row)
  }

  return rows
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}


type ScientificExpansion = {
  value: string
  exactForPhone: boolean
}

function expandScientificInteger(
  value: string,
): ScientificExpansion | null {
  const match = value
    .trim()
    .match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/)

  if (!match) {
    return null
  }

  const sign = match[1] === '-' ? '-' : ''
  const whole = match[2]
  const fraction = match[3] ?? ''
  const exponent = Number.parseInt(match[4], 10)

  if (!Number.isFinite(exponent)) {
    return null
  }

  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '')
  const decimalIndex = whole.length + exponent

  if (decimalIndex <= 0) {
    return {
      value: `${sign}0.${'0'.repeat(Math.abs(decimalIndex))}${digits}`,
      exactForPhone: false,
    }
  }

  if (decimalIndex > digits.length) {
    return {
      value: `${sign}${digits}${'0'.repeat(decimalIndex - digits.length)}`,
      exactForPhone: false,
    }
  }

  if (decimalIndex === digits.length) {
    return {
      value: `${sign}${digits}`,
      exactForPhone: true,
    }
  }

  return {
    value: `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`,
    exactForPhone: false,
  }
}

function normalizeImportedPhone(value: string): string {
  let phone = value.trim()

  const excelFormulaMatch = phone.match(
    /^=\s*"?(\+\d{8,15})"?$/,
  )
  if (excelFormulaMatch) {
    phone = excelFormulaMatch[1]
  }

  phone = phone.replace(/^'+/, '').trim()

  const expanded = expandScientificInteger(phone)
  if (expanded) {
    if (!expanded.exactForPhone) {
      return `INVALID_SCIENTIFIC:${phone}`
    }

    phone = expanded.value
  }

  phone = phone.replace(/[\s().-]/g, '')

  if (/^\d{8,15}$/.test(phone)) {
    phone = `+${phone}`
  }

  return phone
}

function mapRows(rows: string[][]): CsvRow[] {
  if (rows.length < 2) {
    return []
  }

  const headers = rows[0].map(normalizeHeader)
  const columnMap = Object.fromEntries(
    Object.entries(aliases).map(
      ([target, candidates]) => [
        target,
        headers.findIndex((header) =>
          candidates.includes(header),
        ),
      ],
    ),
  ) as Record<string, number>

  return rows.slice(1).map((values) => {
    const mapped = Object.fromEntries(
      Object.entries(columnMap).map(
        ([target, index]) => [
          target,
          index >= 0 ? values[index] ?? '' : '',
        ],
      ),
    ) as CsvRow

    mapped.phone = normalizeImportedPhone(mapped.phone ?? '')
    mapped.mobile = normalizeImportedPhone(mapped.mobile ?? '')

    return mapped
  })
}

export default function CsvContactImporter() {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<CsvRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] =
    useState<ImportResult | null>(null)

  const preview = useMemo(
    () => rows.slice(0, 8),
    [rows],
  )

  async function selectFile(file: File | undefined) {
    setError('')
    setResult(null)

    if (!file) {
      return
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Select a CSV file.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError(
        'The CSV file must be 10 MB or smaller.',
      )
      return
    }

    const mapped = mapRows(
      parseCsv(await file.text()),
    )

    if (mapped.length === 0) {
      setError(
        'The file does not contain importable rows. Include a header row and at least one contact.',
      )
      return
    }

    setFileName(file.name)
    setRows(mapped)
  }

  async function importContacts() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        '/api/contacts/import',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contacts: rows,
          }),
        },
      )

      const data =
        (await response.json()) as ImportResult & {
          error?: string
        }

      if (!response.ok) {
        throw new Error(
          data.error || 'Import failed.',
        )
      }

      setResult(data)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Import failed.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-6 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-400/30 bg-cyan-400/[0.04] px-6 py-12 text-center transition hover:border-cyan-300/60 hover:bg-cyan-400/[0.08]">
          <FileSpreadsheet className="size-10 text-cyan-300" />

          <span className="mt-4 text-lg font-semibold text-white">
            Choose a Flowtix contacts CSV file
          </span>

          <span className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Required per row: a first or last name, valid email,
            international phone number, and the email address of a current
            team member in this organization. The downloadable sample protects phone
            numbers from Excel scientific-notation conversion. Flowtix only
            accepts scientific notation when every phone digit is still
            recoverable; rounded values are rejected instead of guessed. The
            sample CSV also supports
            company, job title, mobile, lifecycle,
            source, lead score, timezone, locale, communication
            preferences, follow-up date, tags, and notes.
          </span>

          <span className="mt-4 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200">
            {fileName || 'Browse CSV'}
          </span>

          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) =>
              void selectFile(
                event.target.files?.[0],
              )
            }
          />
        </label>
      </section>

      {error ? (
        <div className="flex gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          {error}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90">
          <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-white">
                Import preview
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {rows.length.toLocaleString('en-US')} rows
                detected. Duplicate emails are skipped. Rows
                with an unknown/unassigned team member email are
                rejected.
              </p>
            </div>

            <button
              type="button"
              disabled={loading || Boolean(result)}
              onClick={() => void importContacts()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="size-4" />
              {loading
                ? 'Importing…'
                : 'Import contacts'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  {[
                    'Name',
                    'Email',
                    'Phone',
                    'Company',
                    'Assigned team member',
                    'Status',
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-5 py-3"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5 text-slate-300">
                {preview.map((row, index) => (
                  <tr
                    key={`${row.email}-${index}`}
                  >
                    <td className="px-5 py-3 text-white">
                      {`${row.first_name} ${row.last_name}`.trim() ||
                        '—'}
                    </td>
                    <td className="px-5 py-3">
                      {row.email || '—'}
                    </td>
                    <td className="px-5 py-3">
                      {row.phone?.startsWith('INVALID_SCIENTIFIC:')
                        ? `${row.phone.slice('INVALID_SCIENTIFIC:'.length)} — re-enter as text`
                        : row.phone || '—'}
                    </td>
                    <td className="px-5 py-3">
                      {row.company || '—'}
                    </td>
                    <td className="px-5 py-3">
                      {row.assigned_team_member_email ||
                        '—'}
                    </td>
                    <td className="px-5 py-3 capitalize">
                      {row.status || 'active'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.08] p-6">
          <div className="flex gap-3">
            <CheckCircle2 className="size-6 text-emerald-300" />
            <div>
              <h2 className="font-semibold text-white">
                Import completed
              </h2>
              <p className="mt-1 text-sm text-emerald-100/80">
                Imported{' '}
                {result.imported.toLocaleString(
                  'en-US',
                )}{' '}
                contacts, skipped{' '}
                {result.duplicates.toLocaleString(
                  'en-US',
                )}{' '}
                duplicates, and rejected{' '}
                {result.invalid.toLocaleString(
                  'en-US',
                )}{' '}
                invalid rows. Imported contacts are
                assigned immediately and become available
                to the matching team member&apos;s Dialer contact
                panel.
              </p>
            </div>
          </div>

          {result.errors.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-300/15 bg-black/10 p-4">
              <p className="text-sm font-semibold text-amber-100">
                First validation errors
              </p>
              <ul className="mt-2 space-y-1 text-xs text-amber-100/75">
                {result.errors.slice(0, 12).map(
                  (item) => (
                    <li
                      key={`${item.row}-${item.reason}`}
                    >
                      Row {item.row}: {item.reason}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ) : null}

          <Link
            href="/dashboard/contacts"
            className="mt-5 inline-flex rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950"
          >
            View contacts
          </Link>
        </section>
      ) : null}
    </div>
  )
}
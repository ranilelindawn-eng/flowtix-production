import Link from 'next/link'
import { Download } from 'lucide-react'

import CsvContactImporter from '@/components/contacts/CsvContactImporter'
import { requireAdmin } from '@/lib/auth'

export default async function ImportContactsPage() {
  await requireAdmin()

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-400">
            Lead migration
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Import contacts from CSV
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Owner/admin-only bulk import. Assign every imported contact to a
            current team member by email. Standard agents continue to see only
            the contacts assigned to their own membership in the Dialer.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href="/api/contacts/import/sample"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/[0.1]"
          >
            <Download aria-hidden="true" className="size-4" />
            Download sample CSV
          </a>
          <Link
            href="/dashboard/contacts"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Back to contacts
          </Link>
        </div>
      </header>

      <CsvContactImporter />
    </div>
  )
}

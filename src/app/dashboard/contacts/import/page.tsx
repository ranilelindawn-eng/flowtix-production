import Link from 'next/link'
import CsvContactImporter from '@/components/contacts/CsvContactImporter'
import { requirePermission } from '@/lib/auth'

export default async function ImportContactsPage() {
  await requirePermission('contacts.create')

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-400">Lead migration</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Import contacts from CSV</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Upload leads in bulk, preview mapped fields, and safely skip duplicate email addresses in your workspace.</p>
        </div>
        <Link href="/dashboard/contacts" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10">Back to contacts</Link>
      </header>
      <CsvContactImporter />
    </div>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  Flag,
  Search,
} from 'lucide-react'

import {
  PlatformFlagOverrideControls,
  PlatformGlobalFlagControls,
  PlatformRemoveFlagOverride,
} from '@/components/platform/PlatformFeatureFlagControls'
import { getPlatformCustomers } from '@/lib/platform/customers'
import { getPlatformFeatureFlag } from '@/lib/platform/feature-flags'

type SearchParams = Promise<{
  q?: string
  page?: string
}>

function normalizePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default async function PlatformFeatureFlagDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ flagKey: string }>
  searchParams: SearchParams
}) {
  const { flagKey: rawFlagKey } = await params
  const query = await searchParams
  const flagKey = decodeURIComponent(rawFlagKey)
  const q = query.q?.trim() ?? ''
  const page = normalizePage(query.page)
  const pageSize = 25
  const offset = (page - 1) * pageSize

  const [flag, organizations] = await Promise.all([
    getPlatformFeatureFlag(flagKey, {
      search: q,
      limit: pageSize,
      offset,
    }),
    getPlatformCustomers({ limit: 100, offset: 0 }),
  ])

  if (!flag) notFound()

  const totalPages = Math.max(
    Math.ceil(flag.overrideTotal / pageSize),
    1,
  )

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/platform/feature-flags"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Feature Flags
        </Link>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
                <Flag className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  {flag.name}
                </h1>
                <p className="mt-1 text-sm text-slate-500">{flag.flagKey}</p>
              </div>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
              {flag.description ?? 'No description configured.'}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-slate-500">Global state</p>
          <p className="mt-2 text-xl font-semibold text-white">
            {flag.defaultEnabled ? 'Enabled' : 'Disabled'}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-slate-500">Global rollout</p>
          <p className="mt-2 text-xl font-semibold text-white">
            {flag.rolloutPercentage}%
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-slate-500">Overrides</p>
          <p className="mt-2 text-xl font-semibold text-white">
            {flag.overrideCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {flag.enabledOverrideCount} enabled · {flag.disabledOverrideCount} disabled
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-slate-500">Updated</p>
          <p className="mt-2 text-sm font-medium text-white">
            {formatDate(flag.updatedAt)}
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <PlatformGlobalFlagControls flag={flag} />
        <PlatformFlagOverrideControls
          flag={flag}
          organizations={organizations.items.map((organization) => ({
            id: organization.id,
            name: organization.name,
            status: organization.status,
          }))}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Organization overrides</h2>
          <p className="mt-1 text-sm text-slate-500">
            Specific organization state wins over the global enabled state.
          </p>
          <form method="get" className="relative mt-4 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search override by organization name"
              className="h-10 w-full rounded-xl border border-white/10 bg-[#050D18] pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
            />
          </form>
        </div>

        {flag.overrides.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Building2 className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm text-slate-500">
              No organization overrides match this view.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Organization</th>
                  <th className="px-6 py-4 font-medium">Override</th>
                  <th className="px-6 py-4 font-medium">Rollout</th>
                  <th className="px-6 py-4 font-medium">Updated</th>
                  <th className="px-6 py-4 font-medium">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {flag.overrides.map((override) => (
                  <tr key={override.organizationId}>
                    <td className="px-6 py-5">
                      <p className="font-medium text-white">
                        {override.organizationName}
                      </p>
                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {override.organizationStatus}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                          override.enabled
                            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                            : 'border-red-400/20 bg-red-400/10 text-red-200'
                        }`}
                      >
                        {override.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-slate-300">
                      {override.rolloutPercentage === null
                        ? `Inherit ${flag.rolloutPercentage}%`
                        : `${override.rolloutPercentage}%`}
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-slate-300">
                        {formatDate(override.updatedAt)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {override.updatedByEmail ?? override.updatedBy ?? 'Unknown actor'}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <PlatformRemoveFlagOverride
                        flagKey={flag.flagKey}
                        override={override}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="text-sm text-slate-500">
        Page {Math.min(page, totalPages)} of {totalPages} · {flag.overrideTotal} overrides
      </section>
    </div>
  )
}

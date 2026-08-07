import Link from 'next/link'
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Phone,
  Radio,
  Search,
  ShieldCheck,
} from 'lucide-react'

import {
  getPlatformTelephonyConnections,
  getPlatformTelephonyMetrics,
  type PlatformTelephonyProvider,
} from '@/lib/platform/telephony'

type SearchParams = Promise<{
  q?: string
  provider?: string
  status?: string
  page?: string
}>

function normalizeProvider(
  value: string | undefined,
): PlatformTelephonyProvider | 'all' {
  if (
    value === 'twilio' ||
    value === 'telnyx' ||
    value === 'signalwire' ||
    value === 'plivo'
  ) {
    return value
  }
  return 'all'
}

function normalizePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function statusClass(status: string, enabled: boolean): string {
  if (!enabled) {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  }
  if (status === 'connected') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  }
  if (status === 'error') {
    return 'border-red-400/20 bg-red-400/10 text-red-200'
  }
  return 'border-slate-600 bg-slate-800 text-slate-300'
}

function pageHref(input: {
  q: string
  provider: PlatformTelephonyProvider | 'all'
  status: string
  page: number
}): string {
  const params = new URLSearchParams()
  if (input.q) params.set('q', input.q)
  if (input.provider !== 'all') params.set('provider', input.provider)
  if (input.status !== 'all') params.set('status', input.status)
  if (input.page > 1) params.set('page', String(input.page))
  const query = params.toString()
  return query ? `/platform/telephony?${query}` : '/platform/telephony'
}

export default async function PlatformTelephonyPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const query = await searchParams
  const q = query.q?.trim() ?? ''
  const provider = normalizeProvider(query.provider)
  const status = query.status?.trim() || 'all'
  const requestedPage = normalizePage(query.page)
  const pageSize = 25
  const offset = (requestedPage - 1) * pageSize

  const [metrics, directory] = await Promise.all([
    getPlatformTelephonyMetrics(),
    getPlatformTelephonyConnections({
      search: q,
      provider,
      status,
      limit: pageSize,
      offset,
    }),
  ])

  const totalPages = Math.max(Math.ceil(directory.total / pageSize), 1)
  const page = Math.min(requestedPage, totalPages)

  const metricCards = [
    {
      label: 'Connected providers',
      value: metrics.connectedIntegrations,
      detail: `${metrics.enabledIntegrations} enabled`,
    },
    {
      label: 'Organizations',
      value: metrics.organizationsWithTelephony,
      detail: 'With telephony configured',
    },
    {
      label: 'Phone numbers',
      value: metrics.phoneNumbers,
      detail: 'Imported customer-owned numbers',
    },
    {
      label: 'Calls / 24h',
      value: metrics.callsLast24Hours,
      detail: `${metrics.failedCallsLast24Hours} failed`,
    },
    {
      label: 'Provider errors / 24h',
      value: metrics.providerErrorsLast24Hours,
      detail: `${metrics.verificationFailuresLast24Hours} failed verifications`,
    },
  ]

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-300">
            Platform operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Telephony Provider Management
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Cross-tenant provider health and operational controls for customer-owned
            Twilio, Telnyx, SignalWire, and Plivo connections. Provider credentials
            remain encrypted and are never exposed in this interface.
          </p>
        </div>

        <Link
          href="/platform/providers/validation"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 text-sm font-semibold text-blue-200 transition hover:bg-blue-400/15"
        >
          Run provider validation
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((metric) => (
          <article
            key={metric.label}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <p className="text-sm text-slate-500">{metric.label}</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {metric.value.toLocaleString()}
            </p>
            <p className="mt-2 text-xs text-slate-500">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.04] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
          <p className="text-sm leading-6 text-slate-400">
            Customer workspaces still own their provider accounts, numbers, and
            routing. Platform controls only provide operational verification and
            an audited enable/disable safety switch.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <form
          className="grid gap-3 xl:grid-cols-[1fr_180px_180px_auto]"
          method="get"
        >
          <label className="relative block">
            <span className="sr-only">Search telephony connections</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search organization or default phone number"
              className="h-11 w-full rounded-xl border border-white/10 bg-[#050D18] pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
            />
          </label>

          <select
            name="provider"
            defaultValue={provider}
            className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="all">All providers</option>
            <option value="twilio">Twilio</option>
            <option value="telnyx">Telnyx</option>
            <option value="signalwire">SignalWire</option>
            <option value="plivo">Plivo</option>
          </select>

          <select
            name="status"
            defaultValue={status}
            className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="all">All statuses</option>
            <option value="connected">Connected</option>
            <option value="configured">Configured</option>
            <option value="disconnected">Disconnected</option>
            <option value="error">Error</option>
            <option value="disabled">Platform disabled</option>
          </select>

          <button
            type="submit"
            className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Apply filters
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        {directory.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Radio className="mx-auto h-9 w-9 text-slate-600" />
            <h2 className="mt-4 font-semibold text-white">
              No telephony connections found
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Adjust the provider, status, or search filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Organization</th>
                  <th className="px-6 py-4 font-medium">Provider</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Numbers</th>
                  <th className="px-6 py-4 font-medium">24h activity</th>
                  <th className="px-6 py-4 font-medium">Last verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {directory.items.map((connection) => (
                  <tr
                    key={connection.id}
                    className="transition hover:bg-white/[0.025]"
                  >
                    <td className="px-6 py-5">
                      <Link
                        href={`/platform/telephony/${connection.id}`}
                        className="font-semibold text-white hover:text-blue-300"
                      >
                        {connection.organizationName}
                      </Link>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                        <Building2 className="h-3.5 w-3.5" />
                        {connection.organizationStatus}
                      </p>
                    </td>
                    <td className="px-6 py-5 capitalize text-slate-200">
                      {connection.provider}
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                          statusClass(connection.status, connection.enabled)
                        }`}
                      >
                        {!connection.enabled
                          ? 'Platform disabled'
                          : connection.status}
                      </span>
                      {connection.lastError ? (
                        <p className="mt-2 max-w-xs truncate text-xs text-red-300">
                          {connection.lastError}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-5">
                      <p className="flex items-center gap-2 text-slate-300">
                        <Phone className="h-4 w-4 text-slate-500" />
                        {connection.phoneNumberCount}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {connection.defaultPhoneNumber ?? 'No default number'}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-slate-300">
                      <p>{connection.callsLast24Hours} calls</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {connection.providerErrorsLast24Hours} provider errors
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="capitalize text-slate-300">
                        {connection.lastVerificationStatus ?? 'Never checked'}
                      </p>
                      {connection.lastVerificationStatus === 'failed' ? (
                        <AlertTriangle className="mt-1 h-4 w-4 text-red-300" />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={pageHref({
                q,
                provider,
                status,
                page: page - 1,
              })}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={pageHref({
                q,
                provider,
                status,
                page: page + 1,
              })}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  )
}

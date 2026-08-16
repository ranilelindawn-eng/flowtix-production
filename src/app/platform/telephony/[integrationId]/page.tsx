import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Phone,
  Radio,
  ShieldAlert,
  XCircle,
} from 'lucide-react'

import PlatformTelephonyControls from '@/components/platform/PlatformTelephonyControls'
import { runTelephonyAcceptanceValidation } from '@/lib/telephony/acceptance'
import { getPlatformTelephonyConnection } from '@/lib/platform/telephony'

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function capabilityText(capabilities: Record<string, boolean>): string {
  const enabled = Object.entries(capabilities)
    .filter(([, value]) => value)
    .map(([key]) => key.toUpperCase())

  return enabled.length > 0 ? enabled.join(', ') : '—'
}

export default async function PlatformTelephonyConnectionPage({
  params,
}: {
  params: Promise<{ integrationId: string }>
}) {
  const { integrationId } = await params
  const connection = await getPlatformTelephonyConnection(integrationId)

  if (!connection) notFound()

  const readiness = await runTelephonyAcceptanceValidation(connection.organizationId)

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/platform/telephony"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to telephony infrastructure
        </Link>

        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                {connection.organizationName}
              </h1>
              <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-xs font-medium capitalize text-blue-200">
                {connection.provider}
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  connection.enabled
                    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                    : 'border-amber-400/20 bg-amber-400/10 text-amber-200'
                }`}
              >
                {connection.enabled ? connection.status : 'Platform disabled'}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Integration {connection.id}
            </p>
          </div>

          <Link
            href={`/platform/organizations/${connection.organizationId}`}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            <Building2 className="h-4 w-4" />
            Open organization
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <a href="#phone-numbers" className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-blue-400/30 hover:bg-blue-400/[0.06]">
          <Phone className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Phone numbers</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {connection.phoneNumberCount}
          </p>
        </a>
        <a href="#provider-events" className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-blue-400/30 hover:bg-blue-400/[0.06]">
          <Radio className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Calls / 24h</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {connection.callsLast24Hours}
          </p>
        </a>
        <a href="#provider-events" className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-blue-400/30 hover:bg-blue-400/[0.06]">
          <ShieldAlert className="h-5 w-5 text-amber-300" />
          <p className="mt-4 text-sm text-slate-500">Provider errors / 24h</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {connection.providerErrorsLast24Hours}
          </p>
        </a>
        <a href="#verification-history" className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-blue-400/30 hover:bg-blue-400/[0.06]">
          {connection.lastVerificationStatus === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          ) : (
            <XCircle className="h-5 w-5 text-slate-500" />
          )}
          <p className="mt-4 text-sm text-slate-500">Last verification</p>
          <p className="mt-1 capitalize text-white">
            {connection.lastVerificationStatus ?? 'Never checked'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(connection.lastVerificationAt)}
          </p>
        </a>
      </section>

      <section id="readiness" className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.025] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Internal acceptance validation</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Telephony readiness: {readiness.score}%</h2>
            <p className="mt-1 text-sm text-slate-500">Developer-only provider, callback, database, phone-number, webhook, monitoring, and runtime validation for this workspace.</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${readiness.status === 'pass' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : readiness.status === 'warning' ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-rose-400/20 bg-rose-400/10 text-rose-300'}`}>{readiness.status}</span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {readiness.checks.map((item) => (
            <article key={item.key} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <span className={`text-[10px] font-semibold uppercase ${item.status === 'pass' ? 'text-emerald-300' : item.status === 'warning' ? 'text-amber-300' : 'text-rose-300'}`}>{item.status}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold text-white">Connection summary</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Provider</dt>
              <dd className="mt-1 capitalize text-slate-200">
                {connection.provider}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Provider status</dt>
              <dd className="mt-1 capitalize text-slate-200">
                {connection.status}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Connected at</dt>
              <dd className="mt-1 text-slate-200">
                {formatDate(connection.connectedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Updated at</dt>
              <dd className="mt-1 text-slate-200">
                {formatDate(connection.updatedAt)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Default phone number</dt>
              <dd className="mt-1 text-slate-200">
                {connection.defaultPhoneNumber ?? '—'}
              </dd>
            </div>
            {Object.entries(connection.configSummary).map(([key, value]) => (
              <div key={key}>
                <dt className="capitalize text-slate-500">
                  {key.replaceAll('_', ' ')}
                </dt>
                <dd className="mt-1 break-all text-slate-200">
                  {typeof value === 'string' || typeof value === 'number'
                    ? String(value)
                    : 'Configured'}
                </dd>
              </div>
            ))}
          </dl>

          {connection.lastError ? (
            <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
              {connection.lastError}
            </div>
          ) : null}
        </article>

        <PlatformTelephonyControls
          integrationId={connection.id}
          organizationId={connection.organizationId}
          organizationName={connection.organizationName}
          provider={connection.provider}
          enabled={connection.enabled}
        />
      </section>

      <section id="phone-numbers" className="scroll-mt-24 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Flowtix-managed phone numbers</h2>
          <p className="mt-1 text-sm text-slate-500">
            These numbers are managed by Flowtix platform staff and assigned to customer workspaces. Subscribers never receive carrier credentials or provider-management controls.
          </p>
        </div>
        {connection.numbers.length === 0 ? (
          <div className="px-6 py-10 text-sm text-slate-500">
            No phone numbers are attached to this provider connection.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Number</th>
                  <th className="px-6 py-4 font-medium">Capabilities</th>
                  <th className="px-6 py-4 font-medium">Default</th>
                  <th className="px-6 py-4 font-medium">Recording</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {connection.numbers.map((number) => (
                  <tr key={number.id}>
                    <td className="px-6 py-4">
                      <p className="font-medium text-white">{number.phoneNumber}</p>
                      <p className="mt-1 text-xs text-slate-500">{number.friendlyName}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {capabilityText(number.capabilities)}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {number.isDefault ? 'Yes' : 'No'}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {number.recordingEnabled ? 'Enabled' : 'Disabled'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article id="provider-events" className="scroll-mt-24 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          <div className="border-b border-white/10 px-6 py-5">
            <h2 className="font-semibold text-white">Recent provider events</h2>
          </div>
          {connection.recentEvents.length === 0 ? (
            <div className="px-6 py-10 text-sm text-slate-500">
              No recent normalized provider events.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {connection.recentEvents.map((event) => (
                <div key={event.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        {event.eventType}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.providerEventId}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">
                      {formatDate(event.occurredAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {event.normalizedStatus ?? event.rawStatus}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article id="verification-history" className="scroll-mt-24 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          <div className="border-b border-white/10 px-6 py-5">
            <h2 className="font-semibold text-white">Verification history</h2>
          </div>
          {connection.healthChecks.length === 0 ? (
            <div className="px-6 py-10 text-sm text-slate-500">
              This provider connection has not been verified from the Platform portal yet.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {connection.healthChecks.map((check) => (
                <div key={check.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs capitalize ${
                        check.status === 'success'
                          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                          : 'border-red-400/20 bg-red-400/10 text-red-200'
                      }`}
                    >
                      {check.status}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatDate(check.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{check.message}</p>
                  <p className="mt-2 text-xs capitalize text-slate-500">
                    {check.actorRole?.replaceAll('_', ' ') ?? 'Platform staff'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  )
}

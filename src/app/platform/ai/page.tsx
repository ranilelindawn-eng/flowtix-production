import Link from 'next/link'
import { Activity, Bot, BrainCircuit, Clock3, ShieldCheck } from 'lucide-react'

import PlatformAIProviderCard from '@/components/platform/PlatformAIProviderCard'
import {
  getPlatformAIDiagnostics,
  getPlatformAIHealthChecks,
  getPlatformAIMetrics,
  getPlatformAIProviders,
  type PlatformAIDimensionMetric,
} from '@/lib/platform/ai'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function cost(micros: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(micros / 1_000_000)
}

export default async function PlatformAIPage() {
  const [providers, metrics, diagnostics, healthChecks] = await Promise.all([
    getPlatformAIProviders(),
    getPlatformAIMetrics(),
    getPlatformAIDiagnostics(),
    getPlatformAIHealthChecks(),
  ])

  const configuredCount = providers.filter((provider) => provider.configured).length
  const successRate =
    metrics.completedThisMonth + metrics.failedThisMonth > 0
      ? (metrics.completedThisMonth /
          (metrics.completedThisMonth + metrics.failedThisMonth)) *
        100
      : 0

  const cards = [
    {
      label: 'Configured providers',
      value: `${configuredCount}/${providers.length}`,
      detail: 'Server-side provider configuration',
      icon: Bot,
    },
    {
      label: 'AI requests this month',
      value: metrics.requestsThisMonth.toLocaleString(),
      detail: `${successRate.toFixed(1)}% completed`,
      icon: BrainCircuit,
    },
    {
      label: 'Organizations using AI',
      value: metrics.organizationsUsingAIThisMonth.toLocaleString(),
      detail: 'Current month',
      icon: Activity,
    },
    {
      label: 'AI requests / 24h',
      value: metrics.requestsLast24Hours.toLocaleString(),
      detail: `${metrics.failuresLast24Hours} failures`,
      icon: Clock3,
    },
    {
      label: 'Recorded AI cost',
      value: cost(metrics.costMicrosThisMonth),
      detail: `${(metrics.inputTokensThisMonth + metrics.outputTokensThisMonth).toLocaleString()} tokens`,
      icon: Activity,
    },
  ]

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-300">Platform operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            AI Provider Management
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Inspect Flowtix-wide AI provider configuration, fallback priority,
            capabilities, health, usage, latency, tokens, and recorded costs.
            Provider credentials remain server environment secrets and are never
            returned to this page or stored in platform tables.
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
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <article
            key={label}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <Icon className="h-5 w-5 text-blue-300" />
            <p className="mt-4 text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
            <p className="mt-2 text-xs text-slate-500">{detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.04] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
          <p className="text-sm leading-6 text-slate-400">
            Provider keys remain in Vercel/server environment variables. This
            phase intentionally does not copy credentials into Supabase. Model
            and provider changes continue to use the existing Flowtix AI
            provider abstraction and environment configuration.
          </p>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {providers.map((provider) => (
          <PlatformAIProviderCard key={provider.provider} provider={provider} />
        ))}
      </section>

      <section>
        <div>
          <p className="text-sm font-medium text-blue-300">Developer diagnostics</p>
          <h2 className="mt-2 text-xl font-semibold text-white">AI performance breakdowns</h2>
          <p className="mt-2 text-sm text-slate-500">
            Platform-wide aggregates for the last 30 days. These diagnostics are restricted
            to authorized Flowtix Platform staff and are not exposed in customer workspaces.
          </p>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <PlatformAIDimension title="Feature adoption" rows={diagnostics.featureMetrics} />
          <PlatformAIDimension title="Model performance" rows={diagnostics.modelMetrics} />
          <PlatformAIDimension title="Prompt performance" rows={diagnostics.promptMetrics} />
          <PlatformAIDimension title="Provider performance" rows={diagnostics.providerMetrics} />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Provider verification history</h2>
          <p className="mt-1 text-sm text-slate-500">
            Operational probes executed by authorized Flowtix Platform staff.
          </p>
        </div>

        {healthChecks.length === 0 ? (
          <div className="px-6 py-10 text-sm text-slate-500">
            No Platform AI provider verification has been run yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Provider</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Model</th>
                  <th className="px-6 py-4 font-medium">Latency</th>
                  <th className="px-6 py-4 font-medium">Message</th>
                  <th className="px-6 py-4 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {healthChecks.map((check) => (
                  <tr key={check.id}>
                    <td className="px-6 py-4 capitalize text-slate-200">
                      {check.provider.replaceAll('-', ' ')}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs capitalize ${
                          check.status === 'success'
                            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                            : 'border-red-400/20 bg-red-400/10 text-red-200'
                        }`}
                      >
                        {check.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {check.model ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {check.latencyMs === null ? '—' : `${check.latencyMs} ms`}
                    </td>
                    <td className="max-w-lg px-6 py-4 text-slate-400">
                      {check.message}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                      {formatDate(check.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}


function PlatformAIDimension({
  title,
  rows,
}: {
  title: string
  rows: PlatformAIDimensionMetric[]
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
      <div className="border-b border-white/10 px-6 py-5">
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-left text-sm">
          <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Requests</th>
              <th className="px-5 py-3 font-medium">Success</th>
              <th className="px-5 py-3 font-medium">Latency</th>
              <th className="px-5 py-3 font-medium">Tokens</th>
              <th className="px-5 py-3 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                  No AI usage recorded in the last 30 days.
                </td>
              </tr>
            ) : (
              rows.slice(0, 12).map((row) => (
                <tr key={row.key}>
                  <td className="px-5 py-3 capitalize text-slate-200">{row.label}</td>
                  <td className="px-5 py-3 text-slate-300">{row.requests.toLocaleString()}</td>
                  <td className="px-5 py-3 text-emerald-300">{row.successRate.toFixed(1)}%</td>
                  <td className="px-5 py-3 text-slate-300">{row.averageLatencyMs.toFixed(0)} ms</td>
                  <td className="px-5 py-3 text-slate-300">
                    {(row.inputTokens + row.outputTokens).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-blue-300">{cost(row.costMicros)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleHelp,
  Clock3,
  CreditCard,
  Database,
  ListChecks,
  Radio,
  ShieldCheck,
  XCircle,
} from 'lucide-react'

import {
  getPlatformHealthOverview,
  type PlatformHealthStatus,
} from '@/lib/platform/health'

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function statusClass(status: PlatformHealthStatus): string {
  if (status === 'healthy') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  }
  if (status === 'warning') {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  }
  if (status === 'critical') {
    return 'border-red-400/20 bg-red-400/10 text-red-200'
  }
  return 'border-slate-600 bg-slate-800 text-slate-300'
}

function HealthStatusIcon({
  status,
  className,
}: {
  status: PlatformHealthStatus
  className?: string
}) {
  if (status === 'healthy') {
    return <CheckCircle2 className={className} />
  }

  if (status === 'warning') {
    return <AlertTriangle className={className} />
  }

  if (status === 'critical') {
    return <XCircle className={className} />
  }

  return <CircleHelp className={className} />
}

function HealthComponentIcon({
  componentKey,
  className,
}: {
  componentKey: string
  className?: string
}) {
  if (componentKey === 'database') {
    return <Database className={className} />
  }

  if (componentKey === 'jobs') {
    return <ListChecks className={className} />
  }

  if (componentKey === 'billing') {
    return <CreditCard className={className} />
  }

  if (componentKey === 'telephony') {
    return <Radio className={className} />
  }

  if (componentKey === 'ai') {
    return <Bot className={className} />
  }

  if (componentKey === 'platform_access') {
    return <ShieldCheck className={className} />
  }

  return <Activity className={className} />
}

function formatDetailKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (value) => value.toUpperCase())
}

export default async function PlatformSystemHealthPage() {
  const overview = await getPlatformHealthOverview()

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-300">Platform operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            System Health
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Consolidated operational health for Flowtix database integrity,
            background processing, PayMongo billing, telephony providers, AI
            providers, and internal platform-access controls.
          </p>
        </div>

        <Link
          href="/platform/operations/validation"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 text-sm font-semibold text-blue-200 transition hover:bg-blue-400/15"
        >
          Run operations validation
        </Link>
      </section>

      <section
        className={`rounded-2xl border p-6 ${statusClass(overview.status)}`}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <HealthStatusIcon
              status={overview.status}
              className="mt-0.5 h-7 w-7 shrink-0"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
                Overall platform health
              </p>
              <h2 className="mt-2 text-2xl font-semibold capitalize">
                {overview.status}
              </h2>
              <p className="mt-2 text-sm opacity-80">
                Health score {overview.score}/100
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm opacity-70">
            <Clock3 className="h-4 w-4" />
            Checked {formatDate(overview.checkedAt)}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {overview.components.map((component) => {
          return (
            <article
              key={component.key}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
                  <HealthComponentIcon
                    componentKey={component.key}
                    className="h-5 w-5"
                  />
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(component.status)}`}
                >
                  <HealthStatusIcon
                    status={component.status}
                    className="h-3.5 w-3.5"
                  />
                  {component.status}
                </span>
              </div>

              <h2 className="mt-5 font-semibold text-white">
                {component.label}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {component.summary}
              </p>

              <dl className="mt-5 grid grid-cols-2 gap-3">
                {Object.entries(component.details).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-xl border border-white/10 bg-[#050D18] p-3"
                  >
                    <dt className="text-[11px] uppercase tracking-wider text-slate-600">
                      {formatDetailKey(key)}
                    </dt>
                    <dd className="mt-1 break-words text-sm font-medium text-slate-200">
                      {typeof value === 'boolean'
                        ? value
                          ? 'Yes'
                          : 'No'
                        : value ?? '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          )
        })}
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Current health incidents</h2>
          <p className="mt-1 text-sm text-slate-500">
            Derived from existing Flowtix operational records. This console does
            not mutate or acknowledge incidents.
          </p>
        </div>

        {overview.incidents.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" />
            <h3 className="mt-4 font-semibold text-white">
              No active health incidents
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              No critical or warning conditions were detected by the current
              platform checks.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {overview.incidents.map((incident) => (
              <article key={incident.key} className="px-6 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-3">
                    <AlertTriangle
                      className={`mt-0.5 h-5 w-5 shrink-0 ${
                        incident.severity === 'critical'
                          ? 'text-red-300'
                          : 'text-amber-300'
                      }`}
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">
                          {incident.title}
                        </h3>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs capitalize ${
                            incident.severity === 'critical'
                              ? 'border-red-400/20 bg-red-400/10 text-red-200'
                              : 'border-amber-400/20 bg-amber-400/10 text-amber-200'
                          }`}
                        >
                          {incident.severity}
                        </span>
                      </div>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                        {incident.detail}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        {incident.organizationName ? (
                          <span>{incident.organizationName}</span>
                        ) : null}
                        {incident.resourceType ? (
                          <span>{incident.resourceType}</span>
                        ) : null}
                        {incident.resourceId ? (
                          <span className="max-w-sm truncate">
                            {incident.resourceId}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <p className="whitespace-nowrap text-xs text-slate-600">
                    {formatDate(incident.occurredAt)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

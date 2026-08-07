import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Flag,
  HeartPulse,
  ListChecks,
  ScrollText,
  ShieldCheck,
} from 'lucide-react'

import { getOperationsValidationReport } from '@/lib/platform/operations-validation'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(date)
}

export default async function PlatformOperationsValidationPage() {
  const report = await getOperationsValidationReport()

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/platform/jobs"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Background Jobs
          </Link>
          <Link href="/platform/health" className="text-sm text-slate-400 hover:text-white">
            System Health
          </Link>
          <Link href="/platform/feature-flags" className="text-sm text-slate-400 hover:text-white">
            Feature Flags
          </Link>
        </div>

        <p className="mt-5 text-sm font-medium text-blue-300">
          Phase 2.7 acceptance validation
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Jobs, Health & Feature Flags
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Cross-checks the durable queue state machine, System Health aggregation,
          operational feature-flag configuration, rollout overrides, audit history,
          and the separation between flags and paid subscription entitlements.
        </p>
      </section>

      <section
        className={`rounded-2xl border p-6 ${
          report.healthy
            ? 'border-emerald-400/20 bg-emerald-400/[0.06]'
            : 'border-amber-400/20 bg-amber-400/[0.06]'
        }`}
      >
        <div className="flex items-start gap-4">
          {report.healthy ? (
            <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-300" />
          ) : (
            <AlertTriangle className="mt-0.5 h-7 w-7 shrink-0 text-amber-300" />
          )}
          <div>
            <h2 className="text-lg font-semibold text-white">
              {report.healthy
                ? 'Operations controls are internally consistent'
                : 'Operations controls need review'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Acceptance score: {report.score}/100 · Checked{' '}
              {formatDate(report.checkedAt)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <ListChecks className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Background jobs</p>
          <p className="mt-1 text-2xl font-semibold text-white">{report.jobs.total}</p>
          <p className="mt-2 text-xs text-slate-500">
            {report.jobs.ready} ready · {report.jobs.processing} processing
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <HeartPulse className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">System Health</p>
          <p className="mt-1 text-2xl font-semibold capitalize text-white">
            {report.health.status}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Score {report.health.score}/100 · {report.health.staleJobsReported} stale jobs
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Flag className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Operational flags</p>
          <p className="mt-1 text-2xl font-semibold text-white">{report.flags.configured}</p>
          <p className="mt-2 text-xs text-slate-500">
            {report.flags.overrides} organization overrides
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <ScrollText className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Platform audit actions</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {report.audit.jobActions + report.audit.featureFlagActions}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Jobs {report.audit.jobActions} · Flags {report.audit.featureFlagActions}
          </p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          ['Stale worker leases', report.jobs.staleLeases],
          ['Processing jobs without lease', report.jobs.processingWithoutLease],
          ['Retrying without next retry', report.jobs.retryingWithoutNextRetry],
          ['Terminal jobs retaining worker lock', report.jobs.terminalWithWorkerLock],
          ['Attempts over maximum', report.jobs.attemptsOverMaximum],
          ['Dead-letter before max attempts', report.jobs.deadLetterBeforeMaximum],
          ['Missing expected operational flags', report.flags.missingExpectedFlags],
          ['Unknown operational flags', report.flags.unknownFlags],
          ['Invalid rollout percentages', report.flags.invalidRollouts],
          ['Archived-organization overrides', report.flags.archivedOrganizationOverrides],
          ['Flag / entitlement key collisions', report.flags.entitlementKeyCollisions],
        ].map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"
          >
            <p className="text-sm text-slate-500">{String(label)}</p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                Number(value) === 0 ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {Number(value).toLocaleString()}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.04] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
          <div className="space-y-2 text-sm leading-6 text-slate-400">
            <p>
              Canonical stale-job state now comes from the durable worker lease
              (`lock_expires_at`) in both Background Jobs and System Health.
            </p>
            <p>
              Feature flags remain operational controls only. Paid plan entitlements
              continue to live separately in `subscription_plans.entitlements`.
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Validation findings</h2>
          <p className="mt-1 text-sm text-slate-500">
            This report is read-only and does not retry jobs or change feature flags.
          </p>
        </div>

        {report.findings.length === 0 ? (
          <div className="px-6 py-10">
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              No jobs/health/feature-flag consistency issues detected.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {report.findings.map((finding) => (
              <div key={finding.key} className="px-6 py-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p
                      className={
                        finding.severity === 'critical'
                          ? 'font-semibold text-red-200'
                          : 'font-semibold text-amber-200'
                      }
                    >
                      {finding.message}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{finding.key}</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                    {finding.count.toLocaleString()} affected
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

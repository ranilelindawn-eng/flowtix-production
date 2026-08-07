import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  ShieldCheck,
  Users,
} from 'lucide-react'

import { getSupportSecurityReport } from '@/lib/platform/support-validation'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(date)
}

export default async function PlatformSupportValidationPage() {
  const report = await getSupportSecurityReport()

  const cards = [
    {
      label: 'Active sessions',
      value: report.sessions.active,
      detail: `${report.sessions.total} total sessions`,
      icon: Clock3,
    },
    {
      label: 'Workspace views',
      value: report.audit.workspaceViews,
      detail: `${report.audit.starts} session starts audited`,
      icon: Eye,
    },
    {
      label: 'Expired still active',
      value: report.sessions.expiredButActive,
      detail: 'Expected: 0',
      icon: AlertTriangle,
    },
    {
      label: 'Duplicate active actors',
      value: report.sessions.duplicateActiveActors,
      detail: 'Expected: 0',
      icon: Users,
    },
  ]

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/platform/support"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Support Access
        </Link>

        <p className="mt-5 text-sm font-medium text-blue-300">
          Phase 2.5 acceptance validation
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Support Impersonation Security
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Validates session expiry, actor binding, one-session enforcement,
          reference policy, audit coverage, and the Platform-to-customer
          isolation boundary used by read-only support access.
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
                ? 'Support impersonation controls are consistent'
                : 'Support access needs review'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Security score: {report.score}/100 · Checked{' '}
              {formatDate(report.checkedAt)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <article
            key={label}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <Icon className="h-5 w-5 text-blue-300" />
            <p className="mt-4 text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {value.toLocaleString()}
            </p>
            <p className="mt-2 text-xs text-slate-500">{detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          ['Overlong sessions', report.sessions.overlongSessions],
          [
            'Missing required references',
            report.sessions.missingRequiredReference,
          ],
          [
            'Inactive Platform actors',
            report.sessions.inactivePlatformActors,
          ],
          [
            'Sessions missing start audit',
            report.audit.sessionsWithoutStartAudit,
          ],
          [
            'Support-created customer memberships',
            report.isolation.supportCreatedCustomerMemberships,
          ],
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
          <div className="space-y-1 text-sm text-slate-400">
            <p>
              Session policy: {report.policy.sessionMinutes} minutes · Reference{' '}
              {report.policy.referenceRequired ? 'required' : 'optional'}.
            </p>
            <p>
              Customer helper denial:{' '}
              {report.isolation.platformIdentityCustomerHelpersDenied
                ? 'active'
                : 'not verified'}.
            </p>
            <p>
              Dashboard denial:{' '}
              {report.isolation.platformIdentityDashboardDenied
                ? 'active'
                : 'not verified'}.
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Security findings</h2>
          <p className="mt-1 text-sm text-slate-500">
            This report is read-only and does not enter or modify a customer workspace.
          </p>
        </div>

        {report.findings.length === 0 ? (
          <div className="px-6 py-10">
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              No support-session security inconsistencies detected.
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
                    <p className="mt-1 text-xs text-slate-600">
                      {finding.key}
                    </p>
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

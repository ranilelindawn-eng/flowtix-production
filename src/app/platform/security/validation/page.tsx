import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileKey2,
  KeyRound,
  ScrollText,
  ShieldCheck,
} from 'lucide-react'

import { getPlatformSecurityReport } from '@/lib/platform/security-validation'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(date)
}

export default async function PlatformSecurityValidationPage() {
  const report = await getPlatformSecurityReport()

  const checks = [
    ['Authenticated secret-table privileges', report.secrets.authenticatedTablePrivileges],
    ['Anonymous secret-table privileges', report.secrets.anonTablePrivileges],
    ['Secret-like Platform settings', report.secrets.secretLikePlatformSettings],
    ['Platform RPC secret references', report.secrets.platformRpcSecretReferences],
    ['Audit update/delete privileges', report.audit.updateDeletePrivileges],
    ['Public Platform RPC privileges', report.rpc.publicPlatformFunctionPrivileges],
    ['Anonymous Platform RPC privileges', report.rpc.anonPlatformFunctionPrivileges],
  ]

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/platform/audit"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Audit Logs
        </Link>

        <p className="mt-5 text-sm font-medium text-blue-300">
          Phase 2.8 acceptance validation
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Platform Audit & Security Hardening
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Read-only validation of encrypted integration-secret access, Platform
          RPC exposure, audit immutability, secret sanitization, and privileged
          database access boundaries.
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
                ? 'Platform security boundaries are consistent'
                : 'Platform security findings require review'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Security score: {report.score}/100 · Checked {formatDate(report.checkedAt)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <KeyRound className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Encrypted secret rows</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {report.secrets.encryptedSecretRows}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Browser-readable ciphertext: {report.secrets.browserReadableCiphertext ? 'Yes' : 'No'}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <ScrollText className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Platform audit events</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {report.audit.events}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Immutable trigger: {report.audit.immutableTriggerInstalled ? 'Installed' : 'Missing'}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <FileKey2 className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Secret-like audit keys</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {report.audit.secretLikeAuditKeys}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Expected: 0
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <ShieldCheck className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Public sensitive RPC grants</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {report.rpc.publicSensitiveFunctionPrivileges}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Expected: 0
          </p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {checks.map(([label, value]) => (
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

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Security findings</h2>
          <p className="mt-1 text-sm text-slate-500">
            This validation does not return credential values or modify customer data.
          </p>
        </div>

        {report.findings.length === 0 ? (
          <div className="px-6 py-10 text-sm text-emerald-300">
            No security-hardening inconsistencies detected.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {report.findings.map((finding) => (
              <div key={finding.key} className="px-6 py-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className={
                      finding.severity === 'critical'
                        ? 'font-semibold text-red-200'
                        : 'font-semibold text-amber-200'
                    }>
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

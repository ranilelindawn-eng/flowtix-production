import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  KeyRound,
  PhoneCall,
  ShieldCheck,
} from 'lucide-react'

import { getProviderUsageValidationReport } from '@/lib/platform/provider-validation'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(date)
}

export default async function PlatformProviderValidationPage() {
  const report = await getProviderUsageValidationReport()

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/platform/telephony"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Telephony
          </Link>
          <Link
            href="/platform/ai"
            className="text-sm text-slate-400 hover:text-white"
          >
            AI Providers
          </Link>
        </div>

        <p className="mt-5 text-sm font-medium text-blue-300">
          Phase 2.6 acceptance validation
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Provider & Usage Security
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Read-only consistency checks for customer-owned telephony providers,
          Flowtix AI providers, provider health history, usage ledgers, and
          credential-exposure boundaries.
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
                ? 'Provider and usage ledgers are consistent'
                : 'Provider security or usage records need review'}
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
          <PhoneCall className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Telephony integrations</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {report.telephony.integrations}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {report.telephony.connected} connected · {report.telephony.enabled} enabled
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <PhoneCall className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Calls / 24h</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {report.telephony.callsLast24Hours}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {report.telephony.failedCallsLast24Hours} failed
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Bot className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">AI requests this month</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {report.ai.requestsThisMonth}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {report.ai.completedThisMonth} completed · {report.ai.failedThisMonth} failed
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <KeyRound className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Encrypted secret rows</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {report.secrets.encryptedIntegrationSecretRows}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Platform RPC secret references: {report.secrets.platformRpcSecretReferenceCount}
          </p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          ['Connected providers missing secret', report.telephony.connectedMissingSecret],
          ['Provider/secret organization mismatch', report.telephony.secretOrganizationMismatch],
          ['Phone numbers without provider integration', report.telephony.phoneNumbersWithoutIntegration],
          ['Expired AI reservations still reserved', report.ai.expiredStillReserved],
          ['Completed AI usage missing provider', report.ai.completedMissingProvider],
          ['Completed AI usage missing model', report.ai.completedMissingModel],
          ['Sensitive Platform setting keys', report.secrets.sensitivePlatformSettingKeys],
          ['Platform RPC secret references', report.secrets.platformRpcSecretReferenceCount],
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
              AI credentials remain server environment variables. Telephony
              credentials remain encrypted at rest and Platform RPCs are checked
              for accidental references to encrypted credential columns.
            </p>
            <p>
              Authenticated customer admins currently have RLS-scoped SELECT
              access to encrypted integration-secret ciphertext:{' '}
              <span className="font-medium text-slate-200">
                {report.secrets.authenticatedCanSelectEncryptedSecrets ? 'Yes' : 'No'}
              </span>.
              This does not expose plaintext credentials, but it is tracked as a
              hardening item for the dedicated Phase 2.8 security pass.
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Validation findings</h2>
          <p className="mt-1 text-sm text-slate-500">
            This report does not call providers and does not expose provider credentials.
          </p>
        </div>

        {report.findings.length === 0 ? (
          <div className="px-6 py-10">
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              No provider or usage consistency issues detected.
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

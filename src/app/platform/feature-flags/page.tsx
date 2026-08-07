import Link from 'next/link'
import {
  Flag,
  Gauge,
  ShieldCheck,
} from 'lucide-react'

import { getPlatformFeatureFlags } from '@/lib/platform/feature-flags'

function stateClass(enabled: boolean): string {
  return enabled
    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
    : 'border-slate-600 bg-slate-800 text-slate-300'
}

export default async function PlatformFeatureFlagsPage() {
  const flags = await getPlatformFeatureFlags()

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-300">
            Platform operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Feature Flags
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Operational rollout controls that remain separate from paid-plan
            subscription entitlements.
          </p>
        </div>

        <Link
          href="/platform/operations/validation"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 text-sm font-semibold text-blue-200 transition hover:bg-blue-400/15"
        >
          Run operations validation
        </Link>
      </section>

      <section className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.04] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
          <p className="text-sm leading-6 text-slate-400">
            A feature flag can disable or gradually roll out an operational
            capability, but it cannot grant a paid feature that the customer&apos;s
            subscription plan does not include. Existing entitlements remain
            authoritative.
          </p>
        </div>
      </section>

      {flags.length === 0 ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.025] px-6 py-16 text-center">
          <Flag className="mx-auto h-9 w-9 text-slate-600" />
          <h2 className="mt-4 font-semibold text-white">
            No feature flags configured
          </h2>
        </section>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {flags.map((flag) => (
            <Link
              key={flag.flagKey}
              href={`/platform/feature-flags/${encodeURIComponent(flag.flagKey)}`}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-blue-400/30 hover:bg-white/[0.05]"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
                  <Flag className="h-5 w-5" />
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${stateClass(flag.defaultEnabled)}`}
                >
                  {flag.defaultEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <h2 className="mt-5 text-lg font-semibold text-white">
                {flag.name}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                {flag.flagKey}
              </p>
              <p className="mt-3 min-h-10 text-sm leading-6 text-slate-400">
                {flag.description ?? 'No description configured.'}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-[#050D18] p-3">
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    <Gauge className="h-3.5 w-3.5" />
                    Rollout
                  </p>
                  <p className="mt-1 font-semibold text-white">
                    {flag.rolloutPercentage}%
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#050D18] p-3">
                  <p className="text-xs text-slate-500">Overrides</p>
                  <p className="mt-1 font-semibold text-white">
                    {flag.overrideCount}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}

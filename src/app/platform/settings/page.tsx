import {
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  Settings,
  XCircle,
} from 'lucide-react'

import PlatformSettingsForm from '@/components/platform/PlatformSettingsForm'
import {
  getPlatformEnvironmentStatus,
  getPlatformSettings,
} from '@/lib/platform/settings'

function formatDate(value: string | null): string {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default async function PlatformSettingsPage() {
  const [settings, environment] = await Promise.all([
    getPlatformSettings(),
    getPlatformEnvironmentStatus(),
  ])

  const configuredCount = environment.filter(
    (item) => item.configured,
  ).length

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-blue-300">
          Platform governance
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Platform Settings
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Owner-only non-secret platform configuration and deployment-secret
          readiness. API keys and credentials remain in server environment
          variables and cannot be edited from this page.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Settings className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Platform identity</p>
          <p className="mt-1 text-xl font-semibold text-white">
            {settings.platformName}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Last updated {formatDate(settings.updatedAt)}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <KeyRound className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Environment readiness</p>
          <p className="mt-1 text-xl font-semibold text-white">
            {configuredCount} / {environment.length}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Required and optional server configuration indicators
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <LockKeyhole className="h-5 w-5 text-emerald-300" />
          <p className="mt-4 text-sm text-slate-500">Secret storage</p>
          <p className="mt-1 text-xl font-semibold text-white">Server only</p>
          <p className="mt-2 text-xs text-slate-500">
            No provider secrets stored in Platform Settings
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
          <div>
            <h2 className="font-semibold text-white">Server environment configuration</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Values are never displayed. This panel only reports whether each
              server variable is configured.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {environment.map((item) => (
            <article
              key={item.key}
              className="rounded-xl border border-white/10 bg-[#050D18] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-200">{item.label}</p>
                  <p className="mt-1 break-all text-xs text-slate-600">
                    {item.detail}
                  </p>
                </div>
                {item.configured ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-slate-600" />
                )}
              </div>
              <p className="mt-3 text-xs capitalize text-slate-500">
                {item.category} · {item.configured ? 'configured' : 'not configured'}
              </p>
            </article>
          ))}
        </div>
      </section>

      <PlatformSettingsForm settings={settings} />
    </div>
  )
}

'use client'

import { useActionState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Globe2,
  Headphones,
  Save,
} from 'lucide-react'

import { updatePlatformSettings } from '@/app/platform/settings/actions'
import type { PlatformSettingsSnapshot } from '@/lib/platform/settings'

const initialState = {
  status: 'idle' as const,
  message: '',
}

export default function PlatformSettingsForm({
  settings,
}: {
  settings: PlatformSettingsSnapshot
}) {
  const [state, formAction, pending] = useActionState(
    updatePlatformSettings,
    initialState,
  )

  return (
    <form action={formAction} className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
            <Globe2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-white">General platform metadata</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Non-secret operational identity and contact information.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Platform name</span>
            <input
              name="platformName"
              required
              minLength={2}
              maxLength={80}
              defaultValue={settings.platformName}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-300">Support email</span>
            <input
              name="supportEmail"
              type="email"
              defaultValue={settings.supportEmail}
              placeholder="support@example.com"
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
            />
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-slate-300">Status page URL</span>
            <input
              name="statusPageUrl"
              type="url"
              defaultValue={settings.statusPageUrl}
              placeholder="https://status.example.com"
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
            <Headphones className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Support access policy</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              These settings are enforced by the existing temporary read-only support-session RPC.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Session duration</span>
            <div className="relative mt-2">
              <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                name="supportSessionMinutes"
                type="number"
                min={5}
                max={120}
                required
                defaultValue={settings.supportSessionMinutes}
                className="h-11 w-full rounded-xl border border-white/10 bg-[#050D18] pl-10 pr-14 text-sm text-white outline-none focus:border-blue-400/50"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">min</span>
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-300">Support reference policy</span>
            <select
              name="supportReferenceRequired"
              defaultValue={settings.supportReferenceRequired ? 'true' : 'false'}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
            >
              <option value="false">Reference optional</option>
              <option value="true">Reference required</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="font-semibold text-white">Operational defaults</h2>
        <p className="mt-1 text-sm leading-6 text-slate-400">
          Safe defaults for future platform-managed workflows. Existing customer organization settings remain unchanged.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Default timezone</span>
            <input
              name="defaultTimezone"
              required
              maxLength={100}
              defaultValue={settings.defaultTimezone}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-300">Default locale</span>
            <input
              name="defaultLocale"
              required
              maxLength={20}
              defaultValue={settings.defaultLocale}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-5">
        <label className="block">
          <span className="text-sm font-medium text-amber-100">Change reason</span>
          <textarea
            name="reason"
            required
            minLength={10}
            rows={3}
            placeholder="Explain why these platform-wide settings are changing."
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-400/50"
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {pending ? 'Saving...' : 'Save Platform Settings'}
          </button>

          {state.message ? (
            <div
              className={`flex items-center gap-2 text-sm ${
                state.status === 'success'
                  ? 'text-emerald-300'
                  : 'text-red-300'
              }`}
            >
              {state.status === 'success' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <span>{state.message}</span>
            </div>
          ) : null}
        </div>
      </section>
    </form>
  )
}

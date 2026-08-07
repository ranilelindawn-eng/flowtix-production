'use client'

import { useActionState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
} from 'lucide-react'

import {
  setPlatformTelephonyConnectionEnabled,
  verifyPlatformTelephonyConnection,
} from '@/app/platform/telephony/actions'
import type { PlatformTelephonyProvider } from '@/lib/platform/telephony'

const initialPlatformTelephonyActionState = {
  status: 'idle' as const,
  message: '',
}

type Props = {
  integrationId: string
  organizationId: string
  organizationName: string
  provider: PlatformTelephonyProvider
  enabled: boolean
}

function Result({
  status,
  message,
}: {
  status: 'idle' | 'success' | 'error'
  message: string
}) {
  if (!message) return null

  return (
    <div
      className={`rounded-xl border p-4 text-sm ${
        status === 'success'
          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
          : 'border-red-400/20 bg-red-400/10 text-red-200'
      }`}
    >
      <div className="flex items-start gap-2">
        {status === 'success' ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>{message}</span>
      </div>
    </div>
  )
}

export default function PlatformTelephonyControls({
  integrationId,
  organizationId,
  organizationName,
  provider,
  enabled,
}: Props) {
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyPlatformTelephonyConnection,
    initialPlatformTelephonyActionState,
  )
  const [toggleState, toggleAction, togglePending] = useActionState(
    setPlatformTelephonyConnectionEnabled,
    initialPlatformTelephonyActionState,
  )

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Provider verification</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Test the existing encrypted {provider} connection directly with
              the provider. Credentials are never returned to the browser.
            </p>
          </div>
        </div>

        <form action={verifyAction} className="mt-5">
          <input type="hidden" name="integrationId" value={integrationId} />
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="provider" value={provider} />

          <button
            type="submit"
            disabled={verifyPending || !enabled}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${verifyPending ? 'animate-spin' : ''}`} />
            {verifyPending ? 'Verifying...' : 'Verify provider connection'}
          </button>
        </form>

        <div className="mt-4">
          <Result status={verifyState.status} message={verifyState.message} />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-start gap-3">
          <div
            className={`rounded-xl p-2.5 ${
              enabled
                ? 'bg-amber-500/10 text-amber-300'
                : 'bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {enabled ? (
              <PauseCircle className="h-5 w-5" />
            ) : (
              <PlayCircle className="h-5 w-5" />
            )}
          </div>
          <div>
            <h2 className="font-semibold text-white">
              Platform provider control
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              {enabled
                ? `Temporarily disable ${provider} for ${organizationName} without deleting credentials, phone numbers, or routing configuration.`
                : `Re-enable the preserved ${provider} connection for ${organizationName}.`}
            </p>
          </div>
        </div>

        <form action={toggleAction} className="mt-5 space-y-4">
          <input type="hidden" name="integrationId" value={integrationId} />
          <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />

          <label className="block">
            <span className="text-sm font-medium text-slate-300">
              Action reason
            </span>
            <textarea
              name="reason"
              required
              minLength={10}
              rows={4}
              placeholder={
                enabled
                  ? 'Explain why Flowtix is disabling this provider connection.'
                  : 'Explain why Flowtix is re-enabling this provider connection.'
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
            />
          </label>

          <div className="rounded-xl border border-white/10 bg-[#050D18] p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p className="text-xs leading-5 text-slate-400">
                This is an operational kill switch only. It does not delete
                encrypted credentials, phone numbers, recordings, calls, or
                customer routing configuration. Every change is audit logged.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={togglePending}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
              enabled
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {togglePending
              ? 'Applying...'
              : enabled
                ? 'Disable provider connection'
                : 'Re-enable provider connection'}
          </button>
        </form>

        <div className="mt-4">
          <Result status={toggleState.status} message={toggleState.message} />
        </div>
      </section>
    </div>
  )
}

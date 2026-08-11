'use client'

import { useActionState } from 'react'
import { KeyRound } from 'lucide-react'

import {
  createPlatformApiKey,
  revokePlatformApiKey,
  type CreatePlatformApiKeyState,
} from './actions'
import type { PlatformApiKey } from '@/lib/platform/api-keys'

type Props = {
  organizationId: string
  organizationName: string
  timezone: string
  keys: PlatformApiKey[]
}

const initialState: CreatePlatformApiKeyState = {
  ok: false,
  error: null,
  secret: null,
}

function formatDate(value: string, timezone: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default function PlatformApiKeyManager({
  organizationId,
  organizationName,
  timezone,
  keys,
}: Props) {
  const [state, action, pending] = useActionState(
    createPlatformApiKey,
    initialState,
  )

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-500/15 p-2 text-blue-300">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Create organization API key</h2>
            <p className="text-sm text-slate-400">{organizationName}</p>
          </div>
        </div>

        {state.secret ? (
          <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
            <p className="font-medium text-amber-100">Copy this key now. It will not be displayed again.</p>
            <code className="mt-3 block break-all rounded-lg bg-black/30 p-3 text-sm text-amber-50">
              {state.secret}
            </code>
          </div>
        ) : null}

        {state.error ? (
          <div className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            {state.error}
          </div>
        ) : null}

        <form action={action} className="mt-6 space-y-5">
          <input type="hidden" name="organizationId" value={organizationId} />

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-200" htmlFor="api-key-name">Name</label>
              <input
                id="api-key-name"
                name="name"
                required
                placeholder="Production integration"
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2.5 text-white outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-200" htmlFor="api-key-reason">Audit reason</label>
              <input
                id="api-key-reason"
                name="reason"
                required
                minLength={10}
                placeholder="Why this credential is being created"
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2.5 text-white outline-none focus:border-blue-400"
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-200">Scopes</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
              {['contacts:read', 'contacts:write', 'calls:read', 'calls:write', 'reports:read'].map((scope) => (
                <label key={scope} className="flex items-center gap-2">
                  <input type="checkbox" name="scopes" value={scope} />
                  {scope}
                </label>
              ))}
            </div>
          </div>

          <button
            disabled={pending}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'Create API key'}
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="text-lg font-semibold text-white">Organization API keys</h2>
          <p className="mt-1 text-sm text-slate-400">Only prefixes and hashes are persisted. Raw secrets are shown once.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Prefix</th>
                <th className="px-6 py-4">Scopes</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4">Last used</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-t border-white/10 align-top">
                  <td className="px-6 py-4 font-medium text-white">{key.name}</td>
                  <td className="px-6 py-4 font-mono text-slate-300">{key.keyPrefix}…</td>
                  <td className="px-6 py-4 text-slate-300">{key.scopes.join(', ') || 'None'}</td>
                  <td className="px-6 py-4 text-slate-400">{formatDate(key.createdAt, timezone)}</td>
                  <td className="px-6 py-4 text-slate-400">{key.lastUsedAt ? formatDate(key.lastUsedAt, timezone) : 'Never'}</td>
                  <td className="px-6 py-4">
                    <span className={key.revokedAt ? 'text-slate-500' : 'text-emerald-300'}>
                      {key.revokedAt ? 'Revoked' : 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {!key.revokedAt ? (
                      <form action={revokePlatformApiKey} className="space-y-2">
                        <input type="hidden" name="organizationId" value={organizationId} />
                        <input type="hidden" name="keyId" value={key.id} />
                        <input
                          name="reason"
                          required
                          minLength={10}
                          placeholder="Reason for revocation"
                          className="w-52 rounded-lg border border-white/10 bg-[#07111F] px-2.5 py-2 text-xs text-white outline-none focus:border-red-400"
                        />
                        <button className="block text-sm font-medium text-red-300 hover:text-red-200">
                          Revoke
                        </button>
                      </form>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {keys.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">No API keys exist for this organization.</p>
        ) : null}
      </section>
    </div>
  )
}

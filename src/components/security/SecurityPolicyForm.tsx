'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type SecurityPolicyFormProps = {
  mfaEnforcement?: string
  gracePeriodHours?: number
  requestsPerMinute?: number
  requireIdempotency?: boolean
  blockAnonymous?: boolean
  allowedOrigins?: string[]
  allowedIpCidrs?: string[]
}

function lines(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function SecurityPolicyForm({
  mfaEnforcement = 'optional',
  gracePeriodHours = 24,
  requestsPerMinute = 120,
  requireIdempotency = true,
  blockAnonymous = true,
  allowedOrigins = [],
  allowedIpCidrs = [],
}: SecurityPolicyFormProps) {
  const router = useRouter()
  const [message, setMessage] = useState('')

  async function submit(formData: FormData) {
    setMessage('Saving…')

    const response = await fetch('/api/security/policies', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mfaEnforcement: formData.get('mfaEnforcement'),
        gracePeriodHours: Number(formData.get('gracePeriodHours')),
        requestsPerMinute: Number(formData.get('requestsPerMinute')),
        requireIdempotency: formData.get('requireIdempotency') === 'on',
        blockAnonymous: formData.get('blockAnonymous') === 'on',
        allowedOrigins: lines(formData.get('allowedOrigins')),
        allowedIpCidrs: lines(formData.get('allowedIpCidrs')),
      }),
    })

    const payload = (await response.json()) as { error?: string }
    setMessage(
      response.ok
        ? 'Security policies saved.'
        : payload.error ?? 'Unable to save policies.',
    )
    if (response.ok) router.refresh()
  }

  return (
    <form action={submit} className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-xl font-semibold">Organization security policy</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="text-sm">
          MFA enforcement
          <select
            name="mfaEnforcement"
            defaultValue={mfaEnforcement}
            className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 p-3"
          >
            <option value="optional">Optional</option>
            <option value="admins">Owners and admins</option>
            <option value="all">All members</option>
          </select>
        </label>
        <label className="text-sm">
          MFA grace hours
          <input
            name="gracePeriodHours"
            type="number"
            min="0"
            max="168"
            defaultValue={gracePeriodHours}
            className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 p-3"
          />
        </label>
        <label className="text-sm">
          API requests/minute
          <input
            name="requestsPerMinute"
            type="number"
            min="10"
            max="10000"
            defaultValue={requestsPerMinute}
            className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 p-3"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          Allowed external origins
          <textarea
            name="allowedOrigins"
            rows={4}
            defaultValue={allowedOrigins.join('\n')}
            placeholder="https://app.example.com"
            className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 p-3 font-mono text-xs"
          />
          <span className="mt-1 block text-xs text-slate-500">
            One origin per line. Empty allows any origin; same-origin Flowtix requests remain allowed.
          </span>
        </label>
        <label className="text-sm">
          Allowed IP CIDRs
          <textarea
            name="allowedIpCidrs"
            rows={4}
            defaultValue={allowedIpCidrs.join('\n')}
            placeholder={'203.0.113.10/32\n2001:db8::/48'}
            className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 p-3 font-mono text-xs"
          />
          <span className="mt-1 block text-xs text-slate-500">
            One IP/CIDR per line. Empty does not restrict IP addresses.
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-5 text-sm">
        <label>
          <input
            name="requireIdempotency"
            type="checkbox"
            defaultChecked={requireIdempotency}
            className="mr-2"
          />
          Require idempotency for external writes
        </label>
        <label>
          <input
            name="blockAnonymous"
            type="checkbox"
            defaultChecked={blockAnonymous}
            className="mr-2"
          />
          Block anonymous organization APIs
        </label>
      </div>

      <button className="mt-5 rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">
        Save policies
      </button>
      {message ? <p className="mt-3 text-sm text-cyan-200">{message}</p> : null}
    </form>
  )
}

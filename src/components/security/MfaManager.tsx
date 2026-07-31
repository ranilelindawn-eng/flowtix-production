'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'

type Factor = {
  id: string
  friendly_name?: string
  status: string
}

export default function MfaManager() {
  const supabase = useMemo(() => createClient(), [])
  const [factors, setFactors] = useState<Factor[]>([])
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')

  const loadFactors = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors()

    if (error) {
      setMessage(error.message)
      return
    }

    setFactors((data?.totp ?? []) as Factor[])
  }, [supabase])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadFactors()
    }, 0)

    return () => window.clearTimeout(loadTimer)
  }, [loadFactors])

  async function enroll() {
    setMessage('')

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Flowtix Authenticator',
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setQr(data.totp.qr_code)
    setSecret(data.totp.secret)
    setFactorId(data.id)
  }

  async function verify() {
    const challenge = await supabase.auth.mfa.challenge({ factorId })

    if (challenge.error) {
      setMessage(challenge.error.message)
      return
    }

    const result = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code,
    })

    if (result.error) {
      setMessage(result.error.message)
      return
    }

    setMessage('Two-factor authentication is enabled.')
    setQr('')
    setSecret('')
    setFactorId('')
    setCode('')
    await loadFactors()
  }

  async function remove(id: string) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id })

    setMessage(
      error?.message ?? 'Two-factor authentication was removed.',
    )

    if (!error) {
      await loadFactors()
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-xl font-semibold">
        Two-factor authentication
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Use any TOTP authenticator app to protect your account.
      </p>

      <div className="mt-5 space-y-3">
        {factors.map((factor) => (
          <div
            key={factor.id}
            className="flex items-center justify-between rounded-xl border border-white/10 p-4"
          >
            <div>
              <p className="font-medium">
                {factor.friendly_name || 'Authenticator'}
              </p>
              <p className="text-xs text-emerald-300">
                {factor.status}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void remove(factor.id)}
              className="rounded-lg border border-red-400/30 px-3 py-2 text-sm text-red-200"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {!qr && (
        <button
          type="button"
          onClick={() => void enroll()}
          className="mt-5 rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950"
        >
          Set up authenticator
        </button>
      )}

      {qr && (
        <div className="mt-5 space-y-4">
          <Image
            src={qr}
            alt="Authenticator QR code"
            width={192}
            height={192}
            unoptimized
            className="h-48 w-48 rounded-xl bg-white p-3"
          />
          <p className="break-all text-xs text-slate-400">
            Manual key: {secret}
          </p>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3"
          />
          <button
            type="button"
            onClick={() => void verify()}
            className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950"
          >
            Verify and enable
          </button>
        </div>
      )}

      {message && (
        <p className="mt-4 text-sm text-cyan-200">{message}</p>
      )}
    </section>
  )
}

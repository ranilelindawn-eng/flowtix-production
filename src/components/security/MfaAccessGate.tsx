'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { getUserFacingErrorMessage } from '@/lib/errors/user-facing'

type Factor = {
  id: string
  friendly_name?: string
  status: string
}

type MfaAccessGateProps = {
  nextPath: string
}

export default function MfaAccessGate({ nextPath }: MfaAccessGateProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [factor, setFactor] = useState<Factor | null>(null)
  const [enrollmentId, setEnrollmentId] = useState('')
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadMfaState() {
      const [aalResult, factorResult] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ])

      if (cancelled) return

      if (aalResult.error || factorResult.error) {
        setMessage(
          getUserFacingErrorMessage(aalResult.error ?? factorResult.error, {
            context: 'security',
          }),
        )
        setLoading(false)
        return
      }

      if (aalResult.data?.currentLevel === 'aal2') {
        router.replace(nextPath)
        router.refresh()
        return
      }

      const verifiedFactor = ((factorResult.data?.totp ?? []) as Factor[]).find(
        (item) => item.status === 'verified',
      )

      setFactor(verifiedFactor ?? null)
      setLoading(false)
    }

    void loadMfaState()

    return () => {
      cancelled = true
    }
  }, [nextPath, router, supabase])

  async function beginEnrollment() {
    setMessage('')
    const result = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Flowtix Authenticator',
    })

    if (result.error) {
      setMessage(getUserFacingErrorMessage(result.error, { context: 'security' }))
      return
    }

    setEnrollmentId(result.data.id)
    setQr(result.data.totp.qr_code)
    setSecret(result.data.totp.secret)
  }

  async function verifyFactor() {
    const factorId = factor?.id || enrollmentId
    if (!factorId || !code.trim()) return

    setMessage('Verifying…')
    const challenge = await supabase.auth.mfa.challenge({ factorId })
    if (challenge.error) {
      setMessage(getUserFacingErrorMessage(challenge.error, { context: 'security' }))
      return
    }

    const verification = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    })

    if (verification.error) {
      setMessage(
        getUserFacingErrorMessage(verification.error, { context: 'security' }),
      )
      return
    }

    setMessage('Verified. Opening Flowtix…')
    router.replace(nextPath)
    router.refresh()
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Checking MFA status…</p>
  }

  return (
    <div className="space-y-5">
      {factor ? (
        <>
          <p className="text-sm text-slate-300">
            Your organization requires multi-factor authentication. Enter the
            current code from your authenticator app.
          </p>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white"
          />
          <button
            type="button"
            onClick={() => void verifyFactor()}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950"
          >
            Verify and continue
          </button>
        </>
      ) : qr ? (
        <>
          <p className="text-sm text-slate-300">
            Scan this QR code with a TOTP authenticator, then enter the current
            code to finish enrollment.
          </p>
          <Image
            src={qr}
            alt="Flowtix authenticator QR code"
            width={192}
            height={192}
            unoptimized
            className="mx-auto h-48 w-48 rounded-xl bg-white p-3"
          />
          <p className="break-all text-xs text-slate-400">Manual key: {secret}</p>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white"
          />
          <button
            type="button"
            onClick={() => void verifyFactor()}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950"
          >
            Verify and continue
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-300">
            Your organization requires multi-factor authentication. Set up a
            TOTP authenticator before entering the workspace.
          </p>
          <button
            type="button"
            onClick={() => void beginEnrollment()}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950"
          >
            Set up authenticator
          </button>
        </>
      )}

      {message ? <p className="text-sm text-cyan-200">{message}</p> : null}
    </div>
  )
}

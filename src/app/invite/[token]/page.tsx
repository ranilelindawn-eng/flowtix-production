import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type InvitationPageProps = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}

type InvitationPreview = {
  email: string
  role: string
  organization_name: string
}

function firstRow<T>(value: T[] | T | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

function InvitationMessage({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-3 text-slate-400">{description}</p>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500">
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </main>
  )
}

export default async function InvitationPage({ params, searchParams }: InvitationPageProps) {
  const { token } = await params
  const query = await searchParams
  const invitationPath = `/invite/${encodeURIComponent(token)}`

  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return <InvitationMessage title="Invitation unavailable" description="This invitation link is invalid." actionHref="/" actionLabel="Go to Flowtix" />
  }

  const supabase = await createClient()
  const { data: previewData, error: previewError } = await supabase.rpc(
    'get_organization_invitation_preview',
    { invitation_token: token },
  )
  const preview = firstRow(previewData as InvitationPreview[] | InvitationPreview | null)

  if (previewError || !preview) {
    return <InvitationMessage title="Invitation unavailable" description="This invitation is invalid, expired, already accepted, or revoked." actionHref="/" actionLabel="Go to Flowtix" />
  }

  const { data: claims, error: claimsError } = await supabase.auth.getClaims()
  const userId = claims?.claims?.sub
  const signedInEmail = typeof claims?.claims?.email === 'string' ? claims.claims.email.toLowerCase() : null

  if (claimsError || !userId || !signedInEmail) {
    const signupParams = new URLSearchParams({ next: invitationPath, email: preview.email })
    redirect(`/signup?${signupParams.toString()}`)
  }

  if (signedInEmail !== preview.email.toLowerCase()) {
    async function continueWithInvitedEmail() {
      'use server'

      const client = await createClient()
      await client.auth.signOut()

      if (!preview) {
  redirect('/login')
}

const signupParams = new URLSearchParams({
  next: invitationPath,
  email: preview.email,
})

redirect(`/signup?${signupParams.toString()}`)
    }

    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <h1 className="text-2xl font-bold">Email does not match</h1>
          <p className="mt-3 text-slate-400">
            This invitation belongs to {preview.email}. Create or sign in to the account that uses that email to continue.
          </p>
          <form action={continueWithInvitedEmail} className="mt-6">
            <button
              type="submit"
              className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500"
            >
              Continue with invited email
            </button>
          </form>
        </div>
      </main>
    )
  }

  async function acceptInvitation() {
    'use server'
    const client = await createClient()
    const { data: result, error } = await client.rpc('accept_organization_invitation', {
      invitation_token: token,
    })

    if (error || !result) {
      console.error('Invitation acceptance failed:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      })
      redirect(`${invitationPath}?error=${encodeURIComponent(error?.message ?? 'Unable to accept this invitation.')}`)
    }

    redirect('/dashboard')
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <p className="text-sm font-medium text-cyan-400">Flowtix invitation</p>
        <h1 className="mt-2 text-2xl font-bold">Join {preview.organization_name}</h1>
        <p className="mt-3 text-slate-400">
          You were invited as <span className="font-semibold capitalize text-white">{preview.role}</span> using <span className="font-semibold text-white">{preview.email}</span>.
        </p>
        {query.error ? <div role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{query.error}</div> : null}
        <form action={acceptInvitation} className="mt-6">
          <button className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500">Accept invitation</button>
        </form>
      </div>
    </main>
  )
}
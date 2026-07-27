import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type InvitationPageProps = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
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
          <Link
            href={actionHref}
            className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </main>
  )
}

export default async function InvitationPage({
  params,
  searchParams,
}: InvitationPageProps) {
  const { token } = await params
  const query = await searchParams
  const supabase = await createClient()
  const { data: claims, error: claimsError } =
    await supabase.auth.getClaims()

  const userId = claims?.claims?.sub
  const email =
    typeof claims?.claims?.email === 'string'
      ? claims.claims.email.toLowerCase()
      : null

  const invitationPath = `/invite/${encodeURIComponent(token)}`

  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return (
      <InvitationMessage
        title="Invitation unavailable"
        description="This invitation link is invalid."
        actionHref="/dashboard"
        actionLabel="Go to dashboard"
      />
    )
  }

  // Invitation rows are protected by RLS. Authenticate first so an anonymous
  // visitor is not incorrectly shown an "unavailable" message.
  if (claimsError || !userId || !email) {
    redirect(`/login?next=${encodeURIComponent(invitationPath)}`)
  }

  const { data: invitation, error: invitationError } =
    await supabase
      .from('organization_invitations')
      .select(
        'id, organization_id, email, role, expires_at, accepted_at, revoked_at',
      )
      .eq('token', token)
      .maybeSingle()

  if (invitationError) {
    console.error('Failed to load organization invitation:', {
      message: invitationError.message,
      code: invitationError.code,
    })

    return (
      <InvitationMessage
        title="Unable to load invitation"
        description="CallFlow could not verify this invitation. Please try the invitation link again."
        actionHref="/dashboard"
        actionLabel="Go to dashboard"
      />
    )
  }

  if (
    !invitation ||
    invitation.revoked_at ||
    invitation.accepted_at ||
    new Date(invitation.expires_at) <= new Date()
  ) {
    return (
      <InvitationMessage
        title="Invitation unavailable"
        description="This invitation is invalid, expired, already accepted, or revoked."
        actionHref="/dashboard"
        actionLabel="Go to dashboard"
      />
    )
  }

  if (email !== invitation.email.toLowerCase()) {
    return (
      <InvitationMessage
        title="Email does not match"
        description={`Sign out and sign in with ${invitation.email} to accept this invitation.`}
        actionHref="/dashboard"
        actionLabel="Go to dashboard"
      />
    )
  }

  async function acceptInvitation() {
    'use server'

    const client = await createClient()
    const { data: result, error } = await client.rpc(
      'accept_organization_invitation',
      { invitation_token: token },
    )

    if (error || !result) {
      console.error('Invitation acceptance failed:', {
        message: error?.message,
        code: error?.code,
      })

      redirect(
        `${invitationPath}?error=${encodeURIComponent(
          'Unable to accept this invitation. It may have expired or already been used.',
        )}`,
      )
    }

    redirect('/dashboard')
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <p className="text-sm font-medium text-cyan-400">
          CallFlow invitation
        </p>
        <h1 className="mt-2 text-2xl font-bold">
          Join the organization
        </h1>
        <p className="mt-3 text-slate-400">
          You were invited as{' '}
          <span className="font-semibold capitalize text-white">
            {invitation.role}
          </span>
          .
        </p>

        {query.error ? (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
          >
            {query.error}
          </div>
        ) : null}

        <form action={acceptInvitation} className="mt-6">
          <button className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500">
            Accept invitation
          </button>
        </form>
      </div>
    </main>
  )
}

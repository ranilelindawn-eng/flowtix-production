import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims?.sub
  const email = typeof claims?.claims?.email === 'string' ? claims.claims.email.toLowerCase() : null

  const { data: invitation } = await supabase
    .from('organization_invitations')
    .select('id, organization_id, email, role, expires_at, accepted_at, revoked_at')
    .eq('token', token)
    .maybeSingle()

  if (!invitation || invitation.revoked_at || invitation.accepted_at || new Date(invitation.expires_at) <= new Date()) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white"><div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center"><h1 className="text-2xl font-bold">Invitation unavailable</h1><p className="mt-3 text-slate-400">This invitation is invalid, expired, accepted, or revoked.</p><Link href="/login" className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 font-semibold">Go to login</Link></div></main>
  }

  if (!userId || !email) redirect(`/login?next=/invite/${token}`)
  if (email !== invitation.email.toLowerCase()) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white"><div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center"><h1 className="text-2xl font-bold">Email does not match</h1><p className="mt-3 text-slate-400">Sign in with {invitation.email} to accept this invitation.</p></div></main>
  }

  async function acceptInvitation() {
    'use server'
    const client = await createClient()
    const { data: result, error } = await client.rpc('accept_organization_invitation', { invitation_token: token })
    if (error || !result) throw new Error(error?.message ?? 'Unable to accept invitation.')
    redirect('/dashboard')
  }

  return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white"><div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8"><p className="text-sm font-medium text-cyan-400">CallFlow invitation</p><h1 className="mt-2 text-2xl font-bold">Join the organization</h1><p className="mt-3 text-slate-400">You were invited as <span className="font-semibold capitalize text-white">{invitation.role}</span>.</p><form action={acceptInvitation} className="mt-6"><button className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500">Accept invitation</button></form></div></main>
}

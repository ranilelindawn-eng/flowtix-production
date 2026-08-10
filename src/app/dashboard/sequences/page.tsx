import Link from 'next/link'
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  Workflow,
} from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import {
  getCurrentEntitlements,
  hasEntitlement,
} from '@/lib/entitlements'
import { createClient } from '@/lib/supabase/server'
import { getTeamMembers } from '@/lib/team'

import SequenceCreateForm from './SequenceCreateForm'
import {
  enrollContact,
  setSequenceStatus,
  updateEnrollmentStatus,
} from './actions'


function SequencesLocked({
  planName,
  subscriptionStatus,
}: {
  planName: string
  subscriptionStatus: string
}) {
  const statusLabel = subscriptionStatus
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.24em] text-cyan-400">
          Sales automation
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Sequences
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Build coordinated follow-up workflows after automation sequences
          are enabled for this organization.
        </p>
      </header>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60">
        <div className="border-b border-white/10 bg-gradient-to-r from-blue-500/10 via-cyan-400/5 to-transparent p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-500/10">
                <LockKeyhole className="h-6 w-6 text-blue-300" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Automation sequences are not included in the current plan
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Current plan: {planName} · Subscription: {statusLabel}
                </p>
              </div>
            </div>

            <Link
              href="/dashboard/billing?feature=automation.sequences"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400"
            >
              <CreditCard className="h-4 w-4" />
              View eligible plans
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-3">
          {[
            'Multi-step email, SMS, task, and call workflows',
            'Retry-safe enrollment processing',
            'Owner, schedule, and execution tracking',
          ].map((feature) => (
            <div
              key={feature}
              className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"
            >
              <div className="flex items-start gap-2 text-sm font-semibold text-white">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                {feature}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 bg-white/[0.02] px-6 py-4">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <Workflow className="h-5 w-5 text-blue-300" />
            Sequence actions and background execution remain entitlement
            protected until the feature is active.
          </div>
        </div>
      </section>
    </div>
  )
}

export default async function SequencesPage() {
  const membership = await requirePermission('campaigns.view')
  const entitlements = await getCurrentEntitlements()

  if (
    !entitlements ||
    !hasEntitlement(entitlements, 'automation.sequences')
  ) {
    return (
      <SequencesLocked
        planName={entitlements?.planName ?? 'No active plan'}
        subscriptionStatus={
          entitlements?.subscriptionStatus ?? 'inactive'
        }
      />
    )
  }

  const supabase = await createClient()

  const [
    sequenceResult,
    contactResult,
    enrollmentResult,
    templateResult,
    team,
  ] = await Promise.all([
      supabase
        .from('sequences')
        .select('*,sequence_steps(*)')
        .eq('organization_id', membership.organization_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('contacts')
        .select('id,first_name,last_name,email')
        .eq('organization_id', membership.organization_id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('sequence_enrollments')
        .select(
          'id,sequence_id,contact_id,current_step,status,next_run_at,last_error,owner_membership_id',
        )
        .eq('organization_id', membership.organization_id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('message_templates')
        .select('id,name,channel,subject,body')
        .eq('organization_id', membership.organization_id)
        .order('name'),
      getTeamMembers(),
    ])

  if (sequenceResult.error) {
    throw new Error(
      `Failed to load sequences: ${sequenceResult.error.message}`,
    )
  }

  if (contactResult.error) {
    throw new Error(
      `Failed to load sequence contacts: ${contactResult.error.message}`,
    )
  }

  if (enrollmentResult.error) {
    throw new Error(
      `Failed to load sequence enrollments: ${enrollmentResult.error.message}`,
    )
  }

  if (templateResult.error) {
    throw new Error(
      `Failed to load message templates: ${templateResult.error.message}`,
    )
  }

  const sequences = sequenceResult.data ?? []
  const contacts = contactResult.data ?? []
  const enrollments = enrollmentResult.data ?? []
  const templates = (templateResult.data ?? []).map((template) => ({
    ...template,
    channel: template.channel as 'email' | 'sms',
  }))
  const fieldClass =
    'min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white'
  const contactMap = new Map(
    contacts.map((contact) => [
      contact.id,
      [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
        contact.email ||
        'Unnamed contact',
    ]),
  )

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[.24em] text-cyan-400">
          Sales automation
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Sequences</h1>
        <p className="mt-2 text-sm text-slate-400">
          Build, enroll, and operate retry-safe multi-step follow-up workflows.
        </p>
      </header>

      <SequenceCreateForm templates={templates} />

      <div className="grid gap-4 xl:grid-cols-2">
        {sequences.map((sequence) => {
          const sequenceEnrollments = enrollments.filter(
            (item) => item.sequence_id === sequence.id,
          )

          return (
            <article key={sequence.id} className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-white">{sequence.name}</h2>
                  <p className="mt-2 text-sm text-slate-400">{sequence.description || 'No description'}</p>
                </div>
                <span className="rounded-full border border-white/10 px-2 py-1 text-xs capitalize text-slate-300">
                  {sequence.status}
                </span>
              </div>

              <p className="mt-4 text-xs text-cyan-300">
                {sequence.sequence_steps?.length || 0} configured steps ·{' '}
                {sequenceEnrollments.length} enrollments
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {['active', 'paused', 'archived'].map((status) => (
                  <form action={setSequenceStatus} key={status}>
                    <input type="hidden" name="sequence_id" value={sequence.id} />
                    <input type="hidden" name="status" value={status} />
                    <button className="rounded-lg border border-white/10 px-3 py-2 text-xs capitalize text-slate-200">
                      {status}
                    </button>
                  </form>
                ))}
              </div>

              <form action={enrollContact} className="mt-5 grid gap-2 md:grid-cols-2">
                <input type="hidden" name="sequence_id" value={sequence.id} />
                <select required name="contact_id" className={fieldClass} defaultValue="">
                  <option value="" disabled>Select contact</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>{contactMap.get(contact.id)}</option>
                  ))}
                </select>
                <select name="owner_membership_id" className={fieldClass} defaultValue={membership.membership_id}>
                  {team.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.profile?.full_name || member.profile?.email || member.role}
                    </option>
                  ))}
                </select>
                <button
                  disabled={sequence.status !== 'active'}
                  className="rounded-xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 md:col-span-2"
                >
                  Enroll contact
                </button>
              </form>

              {sequenceEnrollments.length > 0 && (
                <div className="mt-5 space-y-2">
                  {sequenceEnrollments.map((enrollment) => (
                    <div key={enrollment.id} className="rounded-xl border border-white/10 p-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="text-white">{contactMap.get(enrollment.contact_id) || 'Contact'}</p>
                          <p className="text-xs text-slate-400">
                            Step {enrollment.current_step} · {enrollment.status}
                            {enrollment.next_run_at
                              ? ` · ${new Date(enrollment.next_run_at).toLocaleString()}`
                              : ''}
                          </p>
                          {enrollment.last_error && (
                            <p className="mt-1 text-xs text-rose-300">{enrollment.last_error}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {enrollment.status !== 'active' ? (
                            <form action={updateEnrollmentStatus}>
                              <input type="hidden" name="enrollment_id" value={enrollment.id} />
                              <input type="hidden" name="status" value="active" />
                              <button
                                disabled={sequence.status !== 'active'}
                                className="rounded border border-white/10 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Resume
                              </button>
                            </form>
                          ) : (
                            <form action={updateEnrollmentStatus}>
                              <input type="hidden" name="enrollment_id" value={enrollment.id} />
                              <input type="hidden" name="status" value="paused" />
                              <button className="rounded border border-white/10 px-2 py-1 text-xs">Pause</button>
                            </form>
                          )}
                          <form action={updateEnrollmentStatus}>
                            <input type="hidden" name="enrollment_id" value={enrollment.id} />
                            <input type="hidden" name="status" value="cancelled" />
                            <button className="rounded border border-rose-400/30 px-2 py-1 text-xs text-rose-200">Cancel</button>
                          </form>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

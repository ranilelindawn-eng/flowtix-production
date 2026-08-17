import { requireFeature } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  getCurrentOrganizationTimezone,
  getTeamMembers,
} from '@/lib/team'

import SequenceCreateForm from './SequenceCreateForm'
import {
  enrollContact,
  updateEnrollmentStatus,
} from './actions'
import SequenceStatusControl from '@/components/sequences/SequenceStatusControl'

export default async function SequencesPage() {
  const timeZone = await getCurrentOrganizationTimezone()
  const membership = await requireFeature(
    'automation.sequences',
    'campaigns.view',
  )

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
                {(['active', 'paused', 'archived'] as const).map((status) => (
                  <SequenceStatusControl
                    key={status}
                    sequenceId={sequence.id}
                    status={status}
                  />
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
                              ? ` · ${new Date(enrollment.next_run_at).toLocaleString('en-US', { timeZone })}`
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

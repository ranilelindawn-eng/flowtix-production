import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Activity,
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  Clock3,
  Contact,
} from 'lucide-react'

import DeleteActivityButton from '@/components/activities/DeleteActivityButton'
import EditActivityDialog from '@/components/activities/EditActivityDialog'
import { requirePermission } from '@/lib/auth'
import { getActivityById } from '@/lib/activities'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganizationTimezone } from '@/lib/team'

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
}

function toLocalDateTimeValue(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

export default async function ActivityDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, organization, timeZone] = await Promise.all([
    params,
    requirePermission('contacts.view'),
    getCurrentOrganizationTimezone(),
  ])

  const activity = await getActivityById({
    organizationId: organization.organization_id,
    activityId: id,
  })

  if (!activity) notFound()

  const supabase = await createClient()

  const [contactResult, companyResult, opportunityResult, contactsResult, companiesResult, opportunitiesResult] = await Promise.all([
    activity.contact_id
      ? supabase.from('contacts').select('id, first_name, last_name, email').eq('organization_id', organization.organization_id).eq('id', activity.contact_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    activity.company_id
      ? supabase.from('companies').select('id, name').eq('organization_id', organization.organization_id).eq('id', activity.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    activity.opportunity_id
      ? supabase.from('opportunities').select('id, name, pipeline_id').eq('organization_id', organization.organization_id).eq('id', activity.opportunity_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('contacts').select('id,first_name,last_name,email').eq('organization_id', organization.organization_id).is('merged_into_contact_id', null).order('first_name').limit(250),
    supabase.from('companies').select('id,name').eq('organization_id', organization.organization_id).order('name').limit(250),
    supabase.from('opportunities').select('id,name').eq('organization_id', organization.organization_id).order('updated_at', { ascending: false }).limit(250),
  ])

  const firstError = [contactResult, companyResult, opportunityResult, contactsResult, companiesResult, opportunitiesResult].find((result) => result.error)?.error
  if (firstError) throw new Error(firstError.message)

  const contact = contactResult.data
  const company = companyResult.data
  const opportunity = opportunityResult.data

  const contactLabel = contact
    ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || contact.email || 'Contact'
    : null

  const contactOptions = (contactsResult.data ?? []).map((item) => ({
    id: item.id,
    label: `${item.first_name ?? ''} ${item.last_name ?? ''}`.trim() || item.email || 'Unnamed contact',
  }))
  const companyOptions = (companiesResult.data ?? []).map((item) => ({ id: item.id, label: item.name }))
  const opportunityOptions = (opportunitiesResult.data ?? []).map((item) => ({ id: item.id, label: item.name }))

  return (
    <div className="space-y-6 xl:-mx-6 2xl:-mx-16">
      <div>
        <Link href="/dashboard/activities" className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to activities
        </Link>
      </div>

      <section className="rounded-[2rem] border border-white/10 bg-[#0B1726]/90 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.08] text-cyan-300">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-cyan-300">Manual activity details</p>
              <h1 className="mt-2 break-words text-2xl font-semibold text-white sm:text-3xl">{activity.subject}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-300">{activity.activity_type.replaceAll('_', ' ')}</span>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-300">{activity.status.replaceAll('_', ' ')}</span>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-400">{activity.direction}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Clock3 className="h-4 w-4" />
              {new Intl.DateTimeFormat('en', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(activity.occurred_at))}
            </div>
            <EditActivityDialog
              activity={activity}
              contactOptions={contactOptions}
              companyOptions={companyOptions}
              opportunityOptions={opportunityOptions}
              occurredAtLocal={toLocalDateTimeValue(activity.occurred_at, timeZone)}
            />
            <DeleteActivityButton activityId={activity.id} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
        <section className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-white">Activity record</h2>

          {activity.body ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-5">
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{activity.body}</p>
            </div>
          ) : null}

          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-[0.15em] text-slate-500">Outcome</dt><dd className="mt-2 text-sm text-white">{activity.outcome || '—'}</dd></div>
            <div><dt className="text-xs uppercase tracking-[0.15em] text-slate-500">Duration</dt><dd className="mt-2 text-sm text-white">{formatDuration(activity.duration_seconds)}</dd></div>
            <div><dt className="text-xs uppercase tracking-[0.15em] text-slate-500">Source</dt><dd className="mt-2 text-sm capitalize text-white">{activity.source.replaceAll('_', ' ')}</dd></div>
            <div><dt className="text-xs uppercase tracking-[0.15em] text-slate-500">Visibility</dt><dd className="mt-2 text-sm capitalize text-white">{activity.visibility}</dd></div>
          </dl>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-6">
          <h2 className="text-lg font-semibold text-white">Related CRM records</h2>
          <div className="mt-5 space-y-3">
            {contact && contactLabel ? (
              <Link href={`/dashboard/contacts/${contact.id}`} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]">
                <Contact className="h-5 w-5 text-cyan-300" />
                <div className="min-w-0"><p className="text-xs uppercase tracking-wide text-slate-500">Contact</p><p className="mt-1 truncate text-sm font-medium text-white">{contactLabel}</p></div>
              </Link>
            ) : null}

            {company ? (
              <Link href={`/dashboard/companies/${company.id}`} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]">
                <Building2 className="h-5 w-5 text-cyan-300" />
                <div className="min-w-0"><p className="text-xs uppercase tracking-wide text-slate-500">Company</p><p className="mt-1 truncate text-sm font-medium text-white">{company.name}</p></div>
              </Link>
            ) : null}

            {opportunity ? (
              <Link href={opportunity.pipeline_id ? `/dashboard/pipelines/${opportunity.pipeline_id}` : '/dashboard/pipelines'} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]">
                <BriefcaseBusiness className="h-5 w-5 text-cyan-300" />
                <div className="min-w-0"><p className="text-xs uppercase tracking-wide text-slate-500">Opportunity</p><p className="mt-1 truncate text-sm font-medium text-white">{opportunity.name}</p></div>
              </Link>
            ) : null}

            {!contact && !company && !opportunity ? (
              <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm leading-6 text-slate-400">This activity does not have a currently linked contact, company, or opportunity.</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}

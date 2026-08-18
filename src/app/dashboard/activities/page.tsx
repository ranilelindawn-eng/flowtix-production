import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  CalendarCheck2,
  Clock3,
  GitBranch,
  PhoneCall,
  Sparkles,
} from 'lucide-react'

import AddActivityDialog from '@/components/activities/AddActivityDialog'
import { requirePermission } from '@/lib/auth'
import { getActivityFeed, type ActivityFeedItem } from '@/lib/activities'
import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganizationTimezone } from '@/lib/team'

function sourceIcon(item: ActivityFeedItem) {
  if (item.sourceKind === 'call') return <PhoneCall className="h-5 w-5" />
  if (item.sourceKind === 'calendar') return <CalendarCheck2 className="h-5 w-5" />
  if (item.sourceKind === 'opportunity') return <GitBranch className="h-5 w-5" />
  return <Activity className="h-5 w-5" />
}

function sourceTone(sourceKind: ActivityFeedItem['sourceKind']) {
  if (sourceKind === 'call') return 'border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-300'
  if (sourceKind === 'calendar') return 'border-violet-400/15 bg-violet-400/[0.08] text-violet-300'
  if (sourceKind === 'opportunity') return 'border-amber-400/15 bg-amber-400/[0.08] text-amber-300'
  return 'border-cyan-400/15 bg-cyan-400/[0.08] text-cyan-300'
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; q?: string }>
}) {
  const timeZone = await getCurrentOrganizationTimezone()
  const organization = await requirePermission('contacts.view')
  const filters = await searchParams
  const supabase = await createClient()

  const [activities, contactsResult, companiesResult, opportunitiesResult] = await Promise.all([
    getActivityFeed({
      organizationId: organization.organization_id,
      type: filters.type,
      status: filters.status,
      search: filters.q,
      limit: 150,
      viewerUserId: organization.user_id,
      viewerMembershipId: organization.membership_id,
      canViewAllCalls: hasPermission(organization.role, 'calls.view_all'),
      canViewAllCalendar: hasPermission(organization.role, 'calendar.view_all'),
      canViewAllOpportunities: hasPermission(organization.role, 'opportunities.view_all'),
    }),
    supabase
      .from('contacts')
      .select('id, first_name, last_name, email')
      .eq('organization_id', organization.organization_id)
      .is('merged_into_contact_id', null)
      .order('first_name')
      .limit(250),
    supabase
      .from('companies')
      .select('id,name')
      .eq('organization_id', organization.organization_id)
      .order('name')
      .limit(250),
    supabase
      .from('opportunities')
      .select('id,name')
      .eq('organization_id', organization.organization_id)
      .order('updated_at', { ascending: false })
      .limit(250),
  ])

  const firstError = [contactsResult, companiesResult, opportunitiesResult].find((result) => result.error)?.error
  if (firstError) throw new Error(firstError.message)

  const contactOptions = (contactsResult.data ?? []).map((contact) => ({
    id: contact.id,
    label:
      `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() ||
      contact.email ||
      'Unnamed contact',
  }))
  const companyOptions = (companiesResult.data ?? []).map((company) => ({ id: company.id, label: company.name }))
  const opportunityOptions = (opportunitiesResult.data ?? []).map((opportunity) => ({ id: opportunity.id, label: opportunity.name }))

  const automaticCount = activities.filter((item) => item.sourceKind !== 'manual').length
  const manualCount = activities.filter((item) => item.sourceKind === 'manual').length

  return (
    <div className="space-y-6 xl:-mx-6 2xl:-mx-16">
      <section className="rounded-[2rem] border border-white/10 bg-[#0B1726]/90 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-cyan-300">CRM workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Activities</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Meaningful customer work in one feed. Completed calls, completed meetings and demos,
              and opportunity stage changes appear automatically; your team can still log interactions manually.
            </p>
          </div>
          <AddActivityDialog contactOptions={contactOptions} companyOptions={companyOptions} opportunityOptions={opportunityOptions} />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Visible activities</p>
            <p className="mt-2 text-2xl font-semibold text-white">{activities.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Automatic</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-300">{automaticCount}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Manually logged</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-300">{manualCount}</p>
          </div>
        </div>
      </section>

      <section className="flex gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4 text-sm text-emerald-100">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
        <div>
          <p className="font-medium">Automatic activity feed is enabled.</p>
          <p className="mt-1 leading-6 text-emerald-100/70">
            Flowtix reads completed calls, completed meetings/demos, and opportunity stage history from their existing CRM records. It does not duplicate every email, SMS, note, or task into Activities.
          </p>
        </div>
      </section>

      <form className="grid gap-3 rounded-3xl border border-white/10 bg-[#0B1726]/90 p-4 sm:grid-cols-3">
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Search activities"
          className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"
        />
        <select
          name="type"
          defaultValue={filters.type ?? ''}
          className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"
        >
          <option value="">All types</option>
          {[
            'call',
            'email',
            'sms',
            'meeting',
            'note',
            'task',
            'status_change',
            'web',
            'social',
            'other',
          ].map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={filters.status ?? ''}
          className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"
        >
          <option value="">All statuses</option>
          {['planned', 'in_progress', 'completed', 'cancelled', 'failed'].map(
            (value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ),
          )}
        </select>
        <button className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-cyan-400 sm:col-span-3">
          Apply filters
        </button>
      </form>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90">
        {activities.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <Clock3 className="mx-auto mb-3 h-6 w-6" />
            No activities found.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {activities.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="group flex gap-4 p-5 transition hover:bg-white/[0.035] sm:p-6"
                aria-label={`Open activity: ${item.subject}`}
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${sourceTone(item.sourceKind)}`}>
                  {sourceIcon(item)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-white transition group-hover:text-cyan-200 sm:text-lg">
                      {item.subject}
                    </h2>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-300">
                      {item.sourceLabel}
                    </span>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-300">
                      {item.activity_type.replaceAll('_', ' ')}
                    </span>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-400">
                      {item.status.replaceAll('_', ' ')}
                    </span>
                  </div>
                  {item.body ? (
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">
                      {item.body}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{new Intl.DateTimeFormat('en', {
                      timeZone,
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(item.occurred_at))}</span>
                    <span>· {item.direction}</span>
                    {item.outcome ? <span>· {item.outcome}</span> : null}
                  </div>
                </div>
                <div className="hidden shrink-0 items-center text-slate-500 transition group-hover:text-cyan-300 sm:flex">
                  <ArrowRight className="h-5 w-5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

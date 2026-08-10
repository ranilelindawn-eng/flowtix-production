export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth'

import CalendarBoard from '@/components/calendar/CalendarBoard'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization, getTeamMembers } from '@/lib/team'

export default async function CalendarPage() {
  await requirePermission('calendar.view')
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  const membership = await getCurrentOrganization()

  if (typeof userId !== 'string' || !membership) redirect('/login')

  const organizationId = membership.organization_id
  const [
    eventsResult,
    contactsResult,
    companiesResult,
    opportunitiesResult,
    membersResult,
    organizationResult,
    integrationsResult,
  ] = await Promise.all([
    supabase.from('calendar_events').select('*').eq('organization_id', organizationId).is('deleted_at', null).order('starts_at'),
    supabase.from('contacts').select('id,first_name,last_name,email').eq('organization_id', organizationId).order('first_name').limit(500),
    supabase.from('companies').select('id,name').eq('organization_id', organizationId).order('name').limit(500),
    supabase.from('opportunities').select('id,name').eq('organization_id', organizationId).order('name').limit(500),
    getTeamMembers(),
    supabase.from('organizations').select('timezone').eq('id', organizationId).maybeSingle(),
    supabase.from('organization_integrations').select('provider,enabled,status').eq('organization_id', organizationId).in('provider', ['zoom', 'google-calendar', 'microsoft-teams']),
  ])

  const memberRows = Array.isArray(membersResult) ? membersResult : []
  const integrations = integrationsResult.data ?? []

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Organization scheduling</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Calendar</h1>
          <p className="mt-2 max-w-3xl text-slate-400">Plan meetings, calls, demos, tasks, and follow-ups. Events are visible across the organization and can be linked to contacts, companies, deals, Zoom, Microsoft Teams, and Google Calendar.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className={integrations.some((item) => item.provider === 'zoom' && item.enabled && item.status === 'connected') ? 'rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300' : 'rounded-full bg-white/5 px-3 py-1.5 text-slate-400'}>Zoom {integrations.some((item) => item.provider === 'zoom' && item.enabled && item.status === 'connected') ? 'connected' : 'not connected'}</span>
          <span className={integrations.some((item) => item.provider === 'google-calendar' && item.enabled && item.status === 'connected') ? 'rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300' : 'rounded-full bg-white/5 px-3 py-1.5 text-slate-400'}>Google Calendar {integrations.some((item) => item.provider === 'google-calendar' && item.enabled && item.status === 'connected') ? 'connected' : 'not connected'}</span>
          <span className={integrations.some((item) => item.provider === 'microsoft-teams' && item.enabled && item.status === 'connected') ? 'rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300' : 'rounded-full bg-white/5 px-3 py-1.5 text-slate-400'}>Teams {integrations.some((item) => item.provider === 'microsoft-teams' && item.enabled && item.status === 'connected') ? 'connected' : 'not connected'}</span>
        </div>
      </div>

      <CalendarBoard
        events={(eventsResult.data ?? []).map((event) => ({ ...event, attendee_emails: Array.isArray(event.attendee_emails) ? event.attendee_emails : [] }))}
        contacts={(contactsResult.data ?? []).map((contact) => ({ id: contact.id, label: `${contact.first_name} ${contact.last_name}`.trim() || contact.email }))}
        companies={(companiesResult.data ?? []).map((company) => ({ id: company.id, label: company.name }))}
        opportunities={(opportunitiesResult.data ?? []).map((deal) => ({ id: deal.id, label: deal.name }))}
        members={memberRows.map((member) => ({ id: member.user_id, label: member.profile?.full_name || member.profile?.email || 'Team member' }))}
        currentUserId={userId}
        timezone={organizationResult.data?.timezone || 'UTC'}
        zoomConnected={integrations.some((item) => item.provider === 'zoom' && item.enabled && item.status === 'connected')}
        teamsConnected={integrations.some((item) => item.provider === 'microsoft-teams' && item.enabled && item.status === 'connected')}
        googleCalendarConnected={integrations.some((item) => item.provider === 'google-calendar' && item.enabled && item.status === 'connected')}
      />
    </div>
  )
}

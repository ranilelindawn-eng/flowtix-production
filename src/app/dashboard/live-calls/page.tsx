import Link from 'next/link'
import {
  Activity,
  ChevronRight,
  Gauge,
  PhoneCall,
  Radio,
  UserRound,
  Users,
} from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { PROVIDER_DISPLAY_NAMES, isTelephonyProvider } from '@/lib/telephony/provider'
import { createClient } from '@/lib/supabase/server'
import { getTeamMembers, type TeamMember } from '@/lib/team'

import LiveCallsAutoRefresh from './LiveCallsAutoRefresh'

export const dynamic = 'force-dynamic'

const ACTIVE_CALL_STATUSES = ['initiating', 'queued', 'ringing', 'connected'] as const

type LiveCall = {
  id: string
  direction: string | null
  status: string
  from_number: string | null
  to_number: string | null
  started_at: string
  provider: string | null
  created_by: string | null
  owner_user_id: string | null
  owner_membership_id: string | null
}

type PresenceRow = {
  user_id: string
  availability: string | null
  activity_state: string | null
  active_call_id: string | null
}

function providerLabel(provider: string | null) {
  if (provider && isTelephonyProvider(provider)) return PROVIDER_DISPLAY_NAMES[provider]
  return 'Voice provider'
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U'
}

function memberName(member: TeamMember) {
  return member.profile?.full_name?.trim() || member.profile?.email?.trim() || 'Unnamed user'
}

function callOwnerUserId(call: LiveCall, membershipUserById: Map<string, string>) {
  return (
    call.owner_user_id ||
    (call.owner_membership_id ? membershipUserById.get(call.owner_membership_id) ?? null : null) ||
    call.created_by ||
    null
  )
}

function callStatusLabel(status: string) {
  if (status === 'initiating') return 'Starting'
  if (status === 'ringing') return 'Ringing'
  if (status === 'connected') return 'Connected'
  if (status === 'queued') return 'Queued'
  return status
}

function activityLabel(status: string | null | undefined, presence: PresenceRow | undefined) {
  if (status === 'connected') return 'On call'
  if (status === 'ringing' || status === 'initiating') return 'Calling'
  if (status === 'queued') return 'Queued'
  if (presence?.activity_state === 'wrap_up') return 'Wrap up'
  return 'Not calling'
}

export default async function LiveCallsPage() {
  const organization = await requirePermission('calls.view')
  const canViewTeam = hasPermission(organization.role, 'team.view')
  const canViewReports = hasPermission(organization.role, 'reports.view')
  const supabase = await createClient()

  let callQuery = supabase
    .from('calls')
    .select(
      'id, direction, status, from_number, to_number, started_at, provider, created_by, owner_user_id, owner_membership_id',
    )
    .eq('organization_id', organization.organization_id)
    .in('status', [...ACTIVE_CALL_STATUSES])
    .is('ended_at', null)
    .order('started_at', { ascending: false })

  if (!canViewTeam) {
    callQuery = callQuery.or(
      `owner_user_id.eq.${organization.user_id},created_by.eq.${organization.user_id}`,
    )
  }

  const [callsResult, presenceResult, teamMembers] = await Promise.all([
    callQuery,
    supabase
      .from('agent_presence')
      .select('user_id, availability, activity_state, active_call_id')
      .eq('organization_id', organization.organization_id),
    canViewTeam ? getTeamMembers() : Promise.resolve([] as TeamMember[]),
  ])

  if (callsResult.error) {
    throw new Error(`Unable to load live calls: ${callsResult.error.message}`)
  }
  if (presenceResult.error) {
    throw new Error(`Unable to load agent presence: ${presenceResult.error.message}`)
  }

  let visibleMembers = teamMembers
  if (!canViewTeam) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name,email,avatar_url')
      .eq('id', organization.user_id)
      .maybeSingle()

    if (profileError) {
      throw new Error(`Unable to load your user profile: ${profileError.message}`)
    }

    visibleMembers = [
      {
        id: organization.membership_id,
        organization_id: organization.organization_id,
        user_id: organization.user_id,
        role: organization.role,
        created_at: '',
        profile: {
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? null,
          avatar_url: profile?.avatar_url ?? null,
        },
      },
    ]
  }

  const liveCalls = (callsResult.data ?? []) as LiveCall[]
  const presenceRows = (presenceResult.data ?? []) as PresenceRow[]
  const presenceByUser = new Map(presenceRows.map((row) => [row.user_id, row]))
  const membershipUserById = new Map(visibleMembers.map((member) => [member.id, member.user_id]))
  const memberByUser = new Map(visibleMembers.map((member) => [member.user_id, member]))

  const callByUser = new Map<string, LiveCall>()
  for (const call of liveCalls) {
    const userId = callOwnerUserId(call, membershipUserById)
    if (!userId || !memberByUser.has(userId) || callByUser.has(userId)) continue
    callByUser.set(userId, call)
  }

  for (const presence of presenceRows) {
    if (!presence.active_call_id || callByUser.has(presence.user_id)) continue
    const call = liveCalls.find((item) => item.id === presence.active_call_id)
    if (call && memberByUser.has(presence.user_id)) {
      callByUser.set(presence.user_id, call)
    }
  }

  const activeUsers = visibleMembers.filter((member) => callByUser.has(member.user_id))
  const idleUsers = visibleMembers.filter((member) => !callByUser.has(member.user_id))
  const totalUsers = visibleMembers.length
  const utilization = totalUsers > 0 ? Math.round((activeUsers.length / totalUsers) * 100) : 0
  const queuedCalls = liveCalls.filter((call) => call.status === 'queued').length

  const monitorDestination = canViewReports
    ? '/dashboard/agent-analytics'
    : canViewTeam
      ? '/dashboard/team'
      : '/dashboard/dialer'

  return (
    <div className="space-y-7 xl:-mx-12 xl:w-[calc(100%+6rem)] 2xl:-mx-24 2xl:w-[calc(100%+12rem)]">
      <LiveCallsAutoRefresh />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Operations</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Live calls</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-400">
            See who is actively calling, who is available for the next conversation, and the current team call load.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-300">
          <Radio className="h-4 w-4 animate-pulse" />
          Live monitoring · refreshes every 5s
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_1.15fr_0.9fr]">
        <a
          href="#active-callers"
          className="group rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.05] p-6 transition hover:-translate-y-0.5 hover:border-emerald-400/35 hover:bg-emerald-400/[0.08]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-emerald-300">Actively calling</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {activeUsers.length === 0 ? 'No one is calling' : activeUsers.map(memberName).join(', ')}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {activeUsers.length} of {totalUsers} visible users on an active call
              </p>
            </div>
            <PhoneCall className="h-6 w-6 text-emerald-300" />
          </div>
          <div className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
            View callers <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </div>
        </a>

        <a
          href="#not-calling"
          className="group rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-white/[0.05]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-300">Not calling</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {idleUsers.length === 0 ? 'Everyone is on a call' : idleUsers.map(memberName).join(', ')}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Ready, away, offline, or between conversations
              </p>
            </div>
            <Users className="h-6 w-6 text-cyan-300" />
          </div>
          <div className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
            View users <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </div>
        </a>

        <Link
          href={monitorDestination}
          className="group rounded-3xl border border-violet-400/15 bg-violet-400/[0.05] p-6 transition hover:-translate-y-0.5 hover:border-violet-400/35 hover:bg-violet-400/[0.08]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-violet-300">Call load meter</p>
              <p className="mt-2 text-4xl font-semibold text-white">{utilization}%</p>
              <p className="mt-1 text-sm text-slate-400">Current visible-team utilization</p>
            </div>
            <Gauge className="h-6 w-6 text-violet-300" />
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-violet-400 transition-[width] duration-500"
              style={{ width: `${Math.max(0, Math.min(100, utilization))}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>{activeUsers.length} calling</span>
            <span>{idleUsers.length} not calling</span>
            <span>{queuedCalls} queued</span>
          </div>
        </Link>
      </div>

      <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-7" id="active-callers">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Calling now</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Active callers</h2>
            <p className="mt-1 text-sm text-slate-400">Click a caller to open the exact live call record.</p>
          </div>
          <p className="text-sm text-slate-500">{activeUsers.length} active user(s)</p>
        </div>

        {activeUsers.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-10 text-center">
            <Activity className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 font-semibold text-white">No users are actively calling</p>
            <p className="mt-1 text-sm text-slate-400">A user appears here when Flowtix has an active call associated with them.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {activeUsers.map((member) => {
              const call = callByUser.get(member.user_id)!
              const presence = presenceByUser.get(member.user_id)
              return (
                <Link
                  key={member.id}
                  href={`/dashboard/calls/${call.id}`}
                  className="group rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-5 transition hover:-translate-y-0.5 hover:border-emerald-400/35 hover:bg-emerald-400/[0.07]"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/10 text-sm font-bold text-emerald-300">
                      {initials(memberName(member))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="truncate text-lg font-semibold text-white">{memberName(member)}</p>
                          <p className="text-xs capitalize text-slate-500">{member.role}</p>
                        </div>
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                          {activityLabel(call.status, presence)}
                        </span>
                      </div>
                      <p className="mt-4 truncate text-sm font-medium text-slate-200">
                        {call.from_number ?? 'Browser'} → {call.to_number ?? 'Destination'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>{callStatusLabel(call.status)}</span>
                        <span className="capitalize">{call.direction}</span>
                        <span>{providerLabel(call.provider)}</span>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300/80">
                        <span>Open call details</span>
                        <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-7" id="not-calling">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Team availability</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Not calling</h2>
            <p className="mt-1 text-sm text-slate-400">Users without an active Flowtix call are shown here.</p>
          </div>
          <p className="text-sm text-slate-500">{idleUsers.length} user(s)</p>
        </div>

        {idleUsers.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-10 text-center">
            <PhoneCall className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 font-semibold text-white">Everyone visible is on a call</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {idleUsers.map((member) => {
              const presence = presenceByUser.get(member.user_id)
              const destination = canViewReports
                ? '/dashboard/agent-analytics'
                : canViewTeam
                  ? '/dashboard/team'
                  : '/dashboard/dialer'
              const availability = presence?.availability || 'offline'
              const activity = presence?.activity_state || 'idle'
              return (
                <Link
                  key={member.id}
                  href={destination}
                  className="group rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-white/[0.05]"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/10 text-sm font-bold text-cyan-300">
                      {initials(memberName(member))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{memberName(member)}</p>
                      <p className="mt-1 text-xs capitalize text-slate-500">{member.role}</p>
                      <div className="mt-4 flex items-center gap-2 text-sm">
                        <span className={`h-2.5 w-2.5 rounded-full ${availability === 'available' ? 'bg-emerald-400' : availability === 'away' ? 'bg-amber-400' : availability === 'dnd' ? 'bg-rose-400' : 'bg-slate-600'}`} />
                        <span className="capitalize text-slate-300">{availability}</span>
                        <span className="text-slate-600">·</span>
                        <span className="capitalize text-slate-400">{activity.replace('_', ' ')}</span>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300/70">
                        <span>{canViewReports ? 'View agent analytics' : canViewTeam ? 'View team' : 'Open dialer'}</span>
                        <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {liveCalls.some((call) => !callOwnerUserId(call, membershipUserById)) ? (
        <section className="rounded-3xl border border-amber-400/15 bg-amber-400/[0.04] p-6">
          <div className="flex items-center gap-3">
            <UserRound className="h-5 w-5 text-amber-300" />
            <div>
              <p className="font-semibold text-white">Unassigned live calls</p>
              <p className="text-sm text-slate-400">Some active calls are waiting for a user assignment or ownership claim.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {liveCalls
              .filter((call) => !callOwnerUserId(call, membershipUserById))
              .map((call) => (
                <Link
                  key={call.id}
                  href={`/dashboard/calls/${call.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4 transition hover:border-amber-300/25"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{call.from_number ?? 'Unknown'} → {call.to_number ?? 'Unknown'}</p>
                    <p className="mt-1 text-xs capitalize text-slate-400">{callStatusLabel(call.status)} · {call.direction}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-amber-300" />
                </Link>
              ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

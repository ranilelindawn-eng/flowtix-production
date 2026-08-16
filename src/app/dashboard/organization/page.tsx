import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  Building2,
  PhoneCall,
  ShieldCheck,
  Users,
  UsersRound,
} from 'lucide-react'

import BusinessSmsNumberCard from '@/components/organization/BusinessSmsNumberCard'
import { requirePermission } from '@/lib/auth'
import { getActiveSmsSenderRequest, getOwnerSmsSenderRequests, smsSenderStatusLabel } from '@/lib/communications/sms-sender'
import { getCurrentEntitlements, hasEntitlement } from '@/lib/entitlements'
import { getOrganizationSettings } from '@/lib/organization-settings'
import { hasPermission } from '@/lib/permissions'
import { getTeamMembers } from '@/lib/team'
import { getFreshTelephonyMonitoringOverview } from '@/lib/telephony/monitoring/service'

export const dynamic = 'force-dynamic'

function formatSeconds(value: number | null): string {
  if (value === null) return '—'
  if (value < 60) return `${Math.round(value)}s`
  return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`
}

const clickableCard = 'group rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-cyan-400/30 hover:bg-slate-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50'

export default async function OrganizationPage() {
  const membership = await requirePermission('organization.view')
  const [settings, members, entitlements] = await Promise.all([
    getOrganizationSettings(),
    getTeamMembers(),
    getCurrentEntitlements(),
  ])

  const canManageRoles = hasPermission(membership.role, 'team.update_roles')
  const activeSmsSender = await getActiveSmsSenderRequest(membership.organization_id)
  const smsRequests = membership.role === 'owner' ? await getOwnerSmsSenderRequests(membership.organization_id) : []
  const currentSmsRequest = smsRequests.find((request) => ['provider_submission_required','provider_processing','action_required'].includes(request.status)) ?? activeSmsSender
  const organizationTimeZone = settings?.timezone || 'UTC'
  const telephonyEnabled = Boolean(entitlements && hasEntitlement(entitlements, 'dialer.cloud'))
  const telephonyOverview = telephonyEnabled
    ? await getFreshTelephonyMonitoringOverview(membership.organization_id)
    : null
  const snapshot = telephonyOverview?.snapshot ?? null
  const openAlerts = telephonyOverview?.alerts.filter((alert) => alert.status === 'open') ?? []

  const telephonyCards = [
    { label: 'Active calls', value: snapshot?.activeCalls ?? 0, icon: PhoneCall, href: '/dashboard/live-calls', detail: 'Open live outbound calling activity' },
    { label: 'Connected calls', value: snapshot?.connectedCalls ?? 0, icon: Activity, href: '/dashboard/live-calls', detail: 'Review currently connected calls' },
    { label: 'Available agents', value: snapshot?.availableAgents ?? 0, icon: UsersRound, href: '/dashboard/agent-analytics', detail: 'Review agent presence and performance' },
    { label: 'Open alerts', value: openAlerts.length, icon: AlertTriangle, href: '#telephony-alerts', detail: 'Jump to current organization alerts' },
  ]

  const diagnostics = [
    { label: 'Calls last hour', value: snapshot?.callsLastHour ?? 0, href: '/dashboard/call-analytics' },
    { label: 'Answer rate', value: `${Math.round((snapshot?.answerRate ?? 0) * 100)}%`, href: '/dashboard/call-analytics' },
    { label: 'Average answer', value: formatSeconds(snapshot?.averageAnswerSeconds ?? null), href: '/dashboard/call-analytics' },
    { label: 'Failed calls', value: snapshot?.failedCallsLastHour ?? 0, href: '/dashboard/calls' },
    { label: 'Provider errors', value: snapshot?.providerErrorsLastHour ?? 0, href: '/dashboard/call-analytics' },
    { label: 'Busy agents', value: snapshot?.busyAgents ?? 0, href: '/dashboard/agent-analytics' },
  ]

  return (
    <div className="space-y-8 lg:relative lg:left-1/2 lg:w-[calc(100vw-328px)] lg:max-w-[1800px] lg:-translate-x-1/2">
      <div>
        <p className="text-sm font-medium text-cyan-400">Workspace</p>
        <h1 className="mt-1 text-3xl font-bold text-white">Organization</h1>
        <p className="mt-2 max-w-4xl text-slate-400">Review your tenant identity, team size, organization access, and outbound calling operations.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/dashboard/settings/organization" className={clickableCard}>
          <Building2 className="h-5 w-5 text-cyan-400" />
          <p className="mt-4 text-sm text-slate-400">Organization</p>
          <p className="mt-1 text-xl font-bold text-white">{settings?.name ?? 'Flowtix Workspace'}</p>
          <p className="mt-3 text-xs text-slate-500 group-hover:text-slate-400">Open organization settings</p>
        </Link>
        <Link href="/dashboard/team" className={clickableCard}>
          <Users className="h-5 w-5 text-cyan-400" />
          <p className="mt-4 text-sm text-slate-400">Active members</p>
          <p className="mt-1 text-xl font-bold text-white">{members.length}</p>
          <p className="mt-3 text-xs text-slate-500 group-hover:text-slate-400">Open team management</p>
        </Link>
        <Link href={canManageRoles ? "/dashboard/roles" : "/dashboard/settings/profile"} className={clickableCard}>
          <ShieldCheck className="h-5 w-5 text-cyan-400" />
          <p className="mt-4 text-sm text-slate-400">Your role</p>
          <p className="mt-1 text-xl font-bold capitalize text-white">{membership.role}</p>
          <p className="mt-3 text-xs text-slate-500 group-hover:text-slate-400">{canManageRoles ? 'Review roles and permissions' : 'Open your profile settings'}</p>
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-semibold text-white">Tenant isolation</h2>
        <p className="mt-2 max-w-5xl text-sm leading-6 text-slate-400">Every team member is linked to this organization. Team, invitation, subscription, billing, and customer records remain scoped to the active workspace.</p>
        <p className="mt-4 break-all rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-400">Organization ID: {membership.organization_id}</p>
      </section>

      <BusinessSmsNumberCard
        isOwner={membership.role === 'owner'}
        activePhoneNumber={activeSmsSender?.phone_number ?? null}
        currentRequest={currentSmsRequest ? {
          id: currentSmsRequest.id,
          phoneNumber: currentSmsRequest.phone_number,
          status: currentSmsRequest.status,
          statusLabel: smsSenderStatusLabel(currentSmsRequest.status),
          providerNote: currentSmsRequest.provider_note,
          submittedAt: new Intl.DateTimeFormat('en-US', { timeZone: organizationTimeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(currentSmsRequest.submitted_at)),
          providerSubmittedAt: currentSmsRequest.provider_submitted_at,
        } : null}
      />

      {telephonyEnabled ? (
        <section id="telephony-operations" className="space-y-5 scroll-mt-24">
          <div>
            <p className="text-sm font-medium text-cyan-400">Outbound operations</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Calling operations</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">Tenant-scoped outbound call activity and operational health. Provider configuration and readiness validation are kept in the internal Flowtix platform dashboard.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {telephonyCards.map(({ label, value, icon: Icon, href, detail }) => (
              <Link key={label} href={href} className={clickableCard}>
                <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-400">{label}</p><Icon className="h-5 w-5 text-cyan-300" /></div>
                <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
                <p className="mt-3 text-xs text-slate-500 group-hover:text-slate-400">{detail}</p>
              </Link>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
            <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-6">
              <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-cyan-300" /><h3 className="font-semibold text-white">Operational diagnostics</h3></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {diagnostics.map(({ label, value, href }) => (
                  <Link key={label} href={href} className="group rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-cyan-400/30 hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50">
                    <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
                    <p className="mt-2 text-xl font-semibold text-white">{value}</p>
                    <p className="mt-2 text-xs text-slate-600 group-hover:text-slate-400">Open supporting data</p>
                  </Link>
                ))}
              </div>
            </section>

            <section id="telephony-alerts" className="scroll-mt-24 rounded-3xl border border-white/10 bg-slate-950/60 p-6">
              <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-300" /><h3 className="font-semibold text-white">Active alerts</h3></div>
              <div className="mt-5 space-y-3">
                {openAlerts.length === 0 ? <p className="text-sm text-slate-400">No active outbound telephony alerts.</p> : openAlerts.slice(0, 6).map((alert) => (
                  <article key={alert.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-white">{alert.title}</p><span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase text-amber-300">{alert.severity}</span></div>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{alert.message}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      ) : null}
    </div>
  )
}

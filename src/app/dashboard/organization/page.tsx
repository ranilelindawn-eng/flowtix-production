import { Building2, Users, ShieldCheck } from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { getOrganizationSettings } from '@/lib/organization-settings'
import { getTeamMembers } from '@/lib/team'

export default async function OrganizationPage() {
  const membership = await requirePermission('organization.view')
  const [settings, members] = await Promise.all([getOrganizationSettings(), getTeamMembers()])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-cyan-400">Workspace</p>
        <h1 className="mt-1 text-3xl font-bold text-white">Organization</h1>
        <p className="mt-2 text-slate-400">Review your tenant identity, team size, and organization access.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><Building2 className="h-5 w-5 text-cyan-400" /><p className="mt-4 text-sm text-slate-400">Organization</p><p className="mt-1 text-xl font-bold text-white">{settings?.name ?? 'CallFlow Workspace'}</p></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><Users className="h-5 w-5 text-cyan-400" /><p className="mt-4 text-sm text-slate-400">Active members</p><p className="mt-1 text-xl font-bold text-white">{members.length}</p></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><ShieldCheck className="h-5 w-5 text-cyan-400" /><p className="mt-4 text-sm text-slate-400">Your role</p><p className="mt-1 text-xl font-bold capitalize text-white">{membership.role}</p></div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-semibold text-white">Tenant isolation</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Every team member is linked to this organization. Phase 4 policies scope team, invitation, plan, and billing records to the active organization.</p>
        <p className="mt-4 break-all rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-400">Organization ID: {membership.organization_id}</p>
      </div>
    </div>
  )
}

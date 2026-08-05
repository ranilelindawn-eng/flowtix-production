'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PlatformAdminOverview } from '@/lib/platform-admin'

type Props = { overview: PlatformAdminOverview }

export default function AdministrationConsole({ overview }: Props) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function command(action: string, payload: Record<string, unknown>) {
    setBusy(true); setMessage(null)
    try {
      const response = await fetch('/api/platform-admin/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Command failed.')
      setMessage('Changes saved successfully.')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Command failed.')
    } finally { setBusy(false) }
  }

  return <div className="space-y-8">
    {message ? <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">{message}</div> : null}
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[
        ['Members', overview.counts.members], ['Teams', overview.counts.teams], ['Custom roles', overview.counts.roles], ['Feature flags', overview.counts.featureFlags],
        ['Open jobs', overview.counts.openJobs], ['Failed jobs', overview.counts.failedJobs], ['Open threats', overview.counts.openThreats], ['Organization', overview.organization.status],
      ].map(([label, value]) => <div key={label} className="rounded-3xl border border-white/10 bg-white/5 p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{String(value)}</p></div>)}
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      <form className="rounded-3xl border border-white/10 bg-white/5 p-6" action={(formData) => command('update_organization', { name: String(formData.get('name') ?? ''), slug: String(formData.get('slug') ?? '') })}>
        <h2 className="text-xl font-semibold text-white">Organization management</h2>
        <div className="mt-5 grid gap-4"><input name="name" defaultValue={overview.organization.name} className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-white" /><input name="slug" defaultValue={overview.organization.slug ?? ''} placeholder="Organization slug" className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-white" /><button disabled={busy} className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">Save organization</button></div>
      </form>
      <form className="rounded-3xl border border-white/10 bg-white/5 p-6" action={(formData) => command('create_team', { name: String(formData.get('name') ?? ''), description: String(formData.get('description') ?? '') })}>
        <h2 className="text-xl font-semibold text-white">Create team</h2>
        <div className="mt-5 grid gap-4"><input name="name" required placeholder="Team name" className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-white" /><textarea name="description" placeholder="Description" className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-white" /><button disabled={busy} className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">Create team</button></div>
      </form>
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold text-white">Teams</h2><div className="mt-4 space-y-3">{overview.teams.map((team) => <div key={team.id} className="rounded-2xl border border-white/10 p-4"><div className="flex justify-between gap-4"><div><p className="font-medium text-white">{team.name}</p><p className="text-sm text-slate-400">{team.description ?? 'No description'}</p></div><span className="text-sm text-slate-300">{team.memberCount} members</span></div></div>)}</div></div>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold text-white">Roles & permissions</h2><div className="mt-4 space-y-3">{overview.roles.map((role) => <div key={role.id} className="rounded-2xl border border-white/10 p-4"><div className="flex justify-between gap-4"><div><p className="font-medium text-white">{role.name}</p><p className="text-sm text-slate-400">{role.description ?? 'No description'}</p></div><span className="text-sm text-slate-300">{role.permissionCount} permissions</span></div></div>)}</div></div>
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold text-white">Feature flags</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{overview.featureFlags.map((flag) => <div key={flag.key} className="flex items-center justify-between rounded-2xl border border-white/10 p-4"><div><p className="font-medium text-white">{flag.name}</p><p className="text-sm text-slate-400">{flag.rolloutPercentage}% rollout</p></div><button disabled={busy} onClick={() => command('set_feature_flag', { key: flag.key, enabled: !flag.enabled, rolloutPercentage: flag.rolloutPercentage })} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white">{flag.enabled ? 'Disable' : 'Enable'}</button></div>)}</div></section>

    <section className="rounded-3xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold text-white">Operational dashboard</h2><div className="mt-4 grid gap-3 md:grid-cols-3">{overview.operations.map((item) => <div key={item.metric} className="rounded-2xl border border-white/10 p-4"><p className="text-sm text-slate-400">{item.metric}</p><p className="mt-2 text-2xl font-semibold text-white">{item.value}</p><p className="mt-1 text-xs uppercase tracking-wider text-slate-500">{item.status}</p></div>)}</div></section>
  </div>
}

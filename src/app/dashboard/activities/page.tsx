import { Activity, Clock3 } from 'lucide-react'
import AddActivityDialog from '@/components/activities/AddActivityDialog'
import { requirePermission } from '@/lib/auth'
import { getActivities } from '@/lib/activities'
import { createClient } from '@/lib/supabase/server'

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; q?: string }> }) {
  const organization = await requirePermission('contacts.view')
  const filters = await searchParams
  const supabase = await createClient()
  const [activities, contactsResult] = await Promise.all([
    getActivities({ organizationId: organization.organization_id, type: filters.type, status: filters.status, search: filters.q, limit: 150 }),
    supabase.from('contacts').select('id, first_name, last_name, email').eq('organization_id', organization.organization_id).is('merged_into_contact_id', null).order('first_name').limit(250),
  ])
  const contactOptions = (contactsResult.data ?? []).map((contact) => ({ id: contact.id, label: `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || contact.email || 'Unnamed contact' }))
  return <div className="space-y-6">
    <section className="rounded-[2rem] border border-white/10 bg-[#0B1726]/90 p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-medium text-cyan-300">CRM workspace</p><h1 className="mt-2 text-3xl font-semibold text-white">Activities</h1><p className="mt-2 text-sm text-slate-400">A durable record of customer interactions across contacts, companies, and opportunities.</p></div><AddActivityDialog contactOptions={contactOptions} /></div></section>
    <form className="grid gap-3 rounded-3xl border border-white/10 bg-[#0B1726]/90 p-4 sm:grid-cols-3"><input name="q" defaultValue={filters.q} placeholder="Search activities" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"/><select name="type" defaultValue={filters.type ?? ''} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"><option value="">All types</option>{['call','email','sms','meeting','note','task','status_change','web','social','other'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select><select name="status" defaultValue={filters.status ?? ''} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"><option value="">All statuses</option>{['planned','in_progress','completed','cancelled','failed'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select><button className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-medium text-white sm:col-span-3">Apply filters</button></form>
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90">{activities.length===0?<div className="p-10 text-center text-slate-400"><Clock3 className="mx-auto mb-3 h-6 w-6"/>No activities found.</div>:<div className="divide-y divide-white/10">{activities.map(item=><article key={item.id} className="flex gap-4 p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.08] text-cyan-300"><Activity className="h-5 w-5"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-medium text-white">{item.subject}</h2><span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-300">{item.activity_type.replaceAll('_',' ')}</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-400">{item.status.replaceAll('_',' ')}</span></div>{item.body?<p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">{item.body}</p>:null}<p className="mt-2 text-xs text-slate-500">{new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.occurred_at))} · {item.direction}</p></div></article>)}</div>}</section>
  </div>
}

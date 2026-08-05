import { Activity, CalendarDays, CheckSquare, Clock3, FileText, GitBranch, Phone } from 'lucide-react'
import { requirePermission } from '@/lib/auth'
import { getTimelineEvents, type TimelineEventType } from '@/lib/timeline'

const icons: Record<TimelineEventType, typeof Activity> = {
  call: Phone,
  note: FileText,
  task: CheckSquare,
  activity: Activity,
  calendar: CalendarDays,
  opportunity: GitBranch,
  system: Clock3,
  other: Activity,
}

export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ type?: string; action?: string; q?: string }> }) {
  const organization = await requirePermission('contacts.view')
  const filters = await searchParams
  const events = await getTimelineEvents({ organizationId: organization.organization_id, eventType: filters.type, action: filters.action, search: filters.q, limit: 200 })

  return <div className="space-y-6">
    <section className="rounded-[2rem] border border-white/10 bg-[#0B1726]/90 p-6 sm:p-8">
      <p className="text-sm font-medium text-cyan-300">CRM workspace</p>
      <h1 className="mt-2 text-3xl font-semibold text-white">Timeline</h1>
      <p className="mt-2 text-sm text-slate-400">A unified, durable history of calls, notes, tasks, activities, calendar events, and opportunity changes.</p>
    </section>
    <form className="grid gap-3 rounded-3xl border border-white/10 bg-[#0B1726]/90 p-4 sm:grid-cols-3">
      <input name="q" defaultValue={filters.q} placeholder="Search timeline" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white" />
      <select name="type" defaultValue={filters.type ?? ''} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"><option value="">All event types</option>{Object.keys(icons).map((value)=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select>
      <select name="action" defaultValue={filters.action ?? ''} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"><option value="">All actions</option>{['created','updated','status_changed','stage_changed','deleted'].map((value)=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select>
      <button className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-medium text-white sm:col-span-3">Apply filters</button>
    </form>
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90">
      {events.length === 0 ? <div className="p-10 text-center text-slate-400"><Clock3 className="mx-auto mb-3 h-6 w-6" />No timeline events found.</div> : <div className="divide-y divide-white/10">{events.map((event)=>{const Icon=icons[event.event_type] ?? Activity; return <article key={event.id} className="flex gap-4 p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.08] text-cyan-300"><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-medium text-white">{event.title}</h2><span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-300">{event.event_type}</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-400">{event.event_action.replaceAll('_',' ')}</span></div>{event.description?<p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">{event.description}</p>:null}<p className="mt-2 text-xs text-slate-500">{new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(event.occurred_at))} · {event.source_table}</p></div></article>})}</div>}
    </section>
  </div>
}

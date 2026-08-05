import { Archive, Hash, RotateCcw, Tag, Trash2 } from 'lucide-react'
import { requirePermission } from '@/lib/auth'
import { getTags } from '@/lib/tags'
import { createTagAction, deleteTagAction, toggleTagAction, updateTagAction } from './actions'

const categories = ['general','lifecycle','source','priority','campaign','product','region','custom'] as const

export default async function TagsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const organization = await requirePermission('contacts.view')
  const filters = await searchParams
  const includeArchived = filters.archived === 'true'
  const tags = await getTags(organization.organization_id, includeArchived)
  const activeCount = tags.filter((tag) => tag.is_active).length
  const assignments = tags.reduce((total, tag) => total + tag.usage_count, 0)

  return <div className="space-y-6">
    <section className="rounded-[2rem] border border-white/10 bg-[#0B1726]/90 p-6 sm:p-8">
      <p className="text-sm font-medium text-cyan-300">CRM organization</p>
      <h1 className="mt-2 text-3xl font-semibold text-white">Tags</h1>
      <p className="mt-2 text-sm text-slate-400">Create governed labels and assign them consistently across contacts, companies, opportunities, campaigns, tasks, activities, calendar events, and calls.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Metric label="Active tags" value={activeCount} />
        <Metric label="Total assignments" value={assignments} />
        <Metric label="Categories used" value={new Set(tags.map((tag) => tag.category)).size} />
      </div>
    </section>

    <form action={createTagAction} className="grid gap-3 rounded-3xl border border-white/10 bg-[#0B1726]/90 p-5 md:grid-cols-2 xl:grid-cols-6">
      <input required name="name" placeholder="Tag name" className="rounded-xl border border-white/10 bg-[#07111F] px-3 py-3 text-white xl:col-span-2" />
      <input name="slug" placeholder="Optional slug" className="rounded-xl border border-white/10 bg-[#07111F] px-3 py-3 text-white" />
      <select name="category" defaultValue="general" className="rounded-xl border border-white/10 bg-[#07111F] px-3 py-3 text-white">{categories.map((category)=><option key={category} value={category}>{category.replaceAll('_',' ')}</option>)}</select>
      <input type="color" name="color" defaultValue="#2563eb" className="h-12 w-full rounded-xl border border-white/10 bg-[#07111F] p-1" />
      <button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Create tag</button>
      <textarea name="description" placeholder="Optional description" className="min-h-20 rounded-xl border border-white/10 bg-[#07111F] px-3 py-3 text-white md:col-span-2 xl:col-span-6" />
    </form>

    <div className="flex justify-end"><a href={includeArchived ? '/dashboard/tags' : '/dashboard/tags?archived=true'} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300">{includeArchived ? 'Hide archived' : 'Show archived'}</a></div>

    <section className="grid gap-4 xl:grid-cols-2">
      {tags.length === 0 ? <div className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-10 text-center text-slate-400 xl:col-span-2"><Tag className="mx-auto mb-3 h-6 w-6" />No tags found.</div> : tags.map((tag)=><article key={tag.id} className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-5">
        <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className="mt-1 h-4 w-4 shrink-0 rounded-full" style={{backgroundColor: tag.color}} /><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-white">{tag.name}</h2><span className="rounded-full border border-white/10 px-2 py-1 text-[11px] capitalize text-slate-400">{tag.category}</span>{!tag.is_active?<span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-300">Archived</span>:null}</div><p className="mt-1 text-xs text-slate-500"><Hash className="mr-1 inline h-3 w-3" />{tag.slug} · {tag.usage_count} assignments</p>{tag.description?<p className="mt-2 text-sm leading-6 text-slate-400">{tag.description}</p>:null}</div></div></div>
        <form action={updateTagAction} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><input type="hidden" name="id" value={tag.id}/><input required name="name" defaultValue={tag.name} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"/><input name="slug" defaultValue={tag.slug} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"/><select name="category" defaultValue={tag.category} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">{categories.map((category)=><option key={category} value={category}>{category.replaceAll('_',' ')}</option>)}</select><input type="color" name="color" defaultValue={tag.color} className="h-10 w-full rounded-xl border border-white/10 bg-slate-900 p-1"/><button className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white">Save</button><textarea name="description" defaultValue={tag.description ?? ''} className="min-h-16 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white sm:col-span-2 lg:col-span-5"/></form>
        <div className="mt-3 flex flex-wrap gap-2"><form action={toggleTagAction}><input type="hidden" name="id" value={tag.id}/><input type="hidden" name="is_active" value={tag.is_active ? 'false' : 'true'}/><button className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300">{tag.is_active?<Archive className="h-3.5 w-3.5"/>:<RotateCcw className="h-3.5 w-3.5"/>}{tag.is_active?'Archive':'Restore'}</button></form>{tag.usage_count===0?<form action={deleteTagAction}><input type="hidden" name="id" value={tag.id}/><button className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 px-3 py-2 text-xs text-rose-300"><Trash2 className="h-3.5 w-3.5"/>Delete</button></form>:null}</div>
      </article>)}
    </section>
  </div>
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-[.16em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div> }

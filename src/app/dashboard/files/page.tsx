import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { listAttachments, type AttachmentCategory, type AttachmentEntityType } from '@/lib/attachments'
import { archiveAttachment, deleteAttachmentPermanently, restoreAttachment, uploadAdvancedAttachment, uploadAttachmentVersion } from './actions'

const field = 'min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white'
const entityTypes: AttachmentEntityType[] = ['company','contact','opportunity','campaign','task','activity','calendar','call','transcript']
const categories: AttachmentCategory[] = ['general','contract','proposal','invoice','recording','transcript','image','document','other']
const sizeLabel = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

export default async function FilesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  const membership = await requirePermission('contacts.view')
  const supabase = await createClient()
  const status = params.status === 'archived' ? 'archived' : 'active'
  const entityType = entityTypes.includes(params.entityType as AttachmentEntityType) ? params.entityType as AttachmentEntityType : undefined
  const category = categories.includes(params.category as AttachmentCategory) ? params.category as AttachmentCategory : undefined
  const [files, companies] = await Promise.all([
    listAttachments({ status, entityType, category, search: params.q }),
    supabase
      .from('companies')
      .select('id,name')
      .eq('organization_id', membership.organization_id)
      .is('merged_into_company_id', null)
      .order('name'),
  ])

  if (companies.error) {
    throw new Error(
      `Failed to load companies for attachment upload: ${companies.error.message}`,
    )
  }

  const totalBytes = files.reduce(
    (sum, file) => sum + Number(file.size_bytes),
    0,
  )

  return <div className="space-y-6">
    <header><p className="text-sm uppercase tracking-[.24em] text-cyan-400">CRM storage</p><h1 className="mt-2 text-3xl font-semibold text-white">Files & attachments</h1><p className="mt-2 text-sm text-slate-400">Private, tenant-isolated files with version metadata, checksums, categories, and short-lived download links.</p></header>
    <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-4"><p className="text-xs uppercase text-slate-500">Files shown</p><p className="mt-2 text-2xl font-semibold text-white">{files.length}</p></div><div className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-4"><p className="text-xs uppercase text-slate-500">Storage shown</p><p className="mt-2 text-2xl font-semibold text-white">{sizeLabel(totalBytes)}</p></div><div className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-4"><p className="text-xs uppercase text-slate-500">Status</p><p className="mt-2 text-2xl font-semibold capitalize text-white">{status}</p></div></section>
    <form action={uploadAdvancedAttachment} className="grid gap-3 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 md:grid-cols-2 xl:grid-cols-5">
      <input type="hidden" name="entity_type" value="company" />
      <select required name="entity_id" className={field}><option value="">Choose company</option>{companies.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select name="category" className={field}>{categories.map(item => <option key={item} value={item}>{item.replace('_',' ')}</option>)}</select>
      <input name="description" placeholder="Description (optional)" className={field} />
      <input required type="file" name="file" className={`${field} py-2`} />
      <button className="rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500">Upload</button>
    </form>
    <form className="grid gap-3 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-4 md:grid-cols-4">
      <input name="q" defaultValue={params.q} placeholder="Search file names" className={field} />
      <select name="entityType" defaultValue={entityType ?? ''} className={field}><option value="">All entity types</option>{entityTypes.map(item => <option key={item} value={item}>{item}</option>)}</select>
      <select name="category" defaultValue={category ?? ''} className={field}><option value="">All categories</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select>
      <select name="status" defaultValue={status} className={field}><option value="active">Active</option><option value="archived">Archived</option></select>
      <button className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white md:col-span-4">Apply filters</button>
    </form>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{files.map(file => <article key={file.id} className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-medium text-white">{file.file_name}</h2><p className="mt-1 text-xs uppercase tracking-wide text-cyan-400">{file.category} · {file.entity_type}</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-slate-400">v{file.version_number}</span></div>{file.description && <p className="mt-3 text-sm text-slate-300">{file.description}</p>}<div className="mt-4 space-y-1 text-xs text-slate-500"><p>{sizeLabel(Number(file.size_bytes))} · {file.mime_type || 'application/octet-stream'}</p><p>Scan: <span className="capitalize">{file.scan_status}</span> · {new Date(file.created_at).toLocaleString()}</p>{file.checksum_sha256 && <p className="truncate font-mono">SHA-256 {file.checksum_sha256}</p>}</div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/api/crm/attachments/${file.id}/download`} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Download</Link>{status === 'active' ? <form action={archiveAttachment}><input type="hidden" name="id" value={file.id}/><button className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200">Archive</button></form> : <><form action={restoreAttachment}><input type="hidden" name="id" value={file.id}/><button className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200">Restore</button></form><form action={deleteAttachmentPermanently}><input type="hidden" name="id" value={file.id}/><button className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300">Delete permanently</button></form></>}</div>{status === 'active' && <form action={uploadAttachmentVersion} className="mt-3 flex gap-2"><input type="hidden" name="id" value={file.id}/><input required type="file" name="file" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#07111F] px-2 py-1 text-xs text-slate-300"/><button className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200">New version</button></form>}</article>)}{files.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">No attachments match these filters.</div>}</div>
  </div>
}

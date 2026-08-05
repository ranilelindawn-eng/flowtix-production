import Link from 'next/link'
import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createPipeline } from '../crm-actions'

const field='min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

export default async function PipelinesPage(){
 const membership=await requireOrganization(); const supabase=await createClient()
 const [{data:pipelines,error},{data:opportunities},{data:stages}]=await Promise.all([
  supabase.from('pipelines').select('id,name,description,pipeline_type,status,currency_code,stage_aging_enabled,stale_after_days,is_default,created_at').eq('organization_id',membership.organization_id).neq('status','archived').order('is_default',{ascending:false}).order('created_at',{ascending:false}),
  supabase.from('opportunities').select('id,pipeline_id,value,status').eq('organization_id',membership.organization_id),
  supabase.from('pipeline_stages').select('id,pipeline_id,is_active').eq('organization_id',membership.organization_id),
 ])
 if(error) throw new Error(`Failed to load pipelines: ${error.message}`)
 return <div className="space-y-6">
  <header><p className="text-sm uppercase tracking-[.24em] text-cyan-400">Revenue workspace</p><h1 className="mt-2 text-3xl font-semibold text-white">Pipelines</h1><p className="mt-2 text-sm text-slate-400">Configure revenue processes, stage governance, forecasting, and aging controls.</p></header>
  <form action={createPipeline} className="grid gap-3 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 md:grid-cols-2 xl:grid-cols-6">
   <input required name="name" placeholder="Pipeline name" className={field}/><input name="description" placeholder="Description" className={`${field} xl:col-span-2`}/>
   <select name="pipeline_type" className={field}><option value="sales">Sales</option><option value="renewal">Renewal</option><option value="expansion">Expansion</option><option value="partner">Partner</option><option value="custom">Custom</option></select>
   <input name="currency_code" defaultValue="USD" maxLength={3} className={field}/><button className="rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500">Create pipeline</button>
  </form>
  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{pipelines?.map(p=>{const deals=opportunities?.filter(o=>o.pipeline_id===p.id)??[];const total=deals.reduce((s,o)=>s+Number(o.value||0),0);const activeStages=stages?.filter(s=>s.pipeline_id===p.id&&s.is_active).length??0;return <Link key={p.id} href={`/dashboard/pipelines/${p.id}`} className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 transition hover:border-cyan-400/30 hover:bg-[#0D1B2D]">
   <div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-300">{p.pipeline_type}</span>{p.is_default&&<span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-300">Default</span>}</div><h2 className="mt-3 text-lg font-semibold text-white">{p.name}</h2><p className="mt-2 line-clamp-2 text-sm text-slate-400">{p.description||'No pipeline description yet.'}</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">{deals.length} deals</span></div>
   <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4"><div><p className="text-xs uppercase tracking-[.18em] text-slate-500">Value</p><p className="mt-1 text-lg font-semibold text-cyan-300">{p.currency_code} {total.toLocaleString('en-US')}</p></div><div><p className="text-xs uppercase tracking-[.18em] text-slate-500">Stages</p><p className="mt-1 text-lg font-semibold text-white">{activeStages}</p></div></div>
  </Link>})}{!pipelines?.length&&<div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">No pipelines found.</div>}</section>
 </div>
}

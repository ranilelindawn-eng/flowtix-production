import { createClient } from '@/lib/supabase/server'
import MfaManager from '@/components/security/MfaManager'

export const dynamic='force-dynamic'
export default async function SecurityCenterPage(){
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
 const [{data:sessions},{data:logs}]=await Promise.all([
  supabase.from('user_sessions').select('*').eq('user_id',user?.id??'').order('last_seen_at',{ascending:false}).limit(20),
  supabase.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(50),
 ])
 return <div className="space-y-8"><div><p className="text-sm uppercase tracking-[.28em] text-cyan-300">Security</p><h1 className="mt-3 text-3xl font-semibold">Security Center</h1><p className="mt-2 text-slate-400">Manage authentication, sessions, devices, and review account activity.</p></div>
 <MfaManager/>
 <section className="rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold">Sessions and device history</h2><div className="mt-4 space-y-3">{sessions?.length?sessions.map(s=><div key={s.id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{s.device_name||'Unknown device'}</p><p className="text-xs text-slate-400">{new Date(s.last_seen_at).toLocaleString()}</p></div><p className="mt-1 text-xs text-slate-500">{s.ip_address||'Unknown IP'} · {s.user_agent||'Unknown browser'}</p>{s.revoked_at&&<p className="mt-2 text-xs text-red-300">Revoked</p>}</div>):<p className="text-sm text-slate-400">Session records appear after the tracking endpoint is enabled.</p>}</div></section>
 <section className="rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold">Audit logs</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-400"><tr><th className="pb-3">Action</th><th className="pb-3">Resource</th><th className="pb-3">Time</th></tr></thead><tbody>{logs?.map(l=><tr key={l.id} className="border-t border-white/10"><td className="py-3">{l.action}</td><td>{l.resource_type||'—'}</td><td>{new Date(l.created_at).toLocaleString()}</td></tr>)}</tbody></table></div></section></div>
}

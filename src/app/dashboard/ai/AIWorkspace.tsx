'use client'

import { useState } from 'react'

type JsonRecord = Record<string, unknown>
async function post(path: string, payload: JsonRecord) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = await response.json() as JsonRecord
  if (!response.ok) throw new Error(String(data.error ?? 'Request failed.'))
  return data
}

export default function AIWorkspace() {
  const [transcript, setTranscript] = useState('')
  const [analysis, setAnalysis] = useState<JsonRecord | null>(null)
  const [email, setEmail] = useState<JsonRecord | null>(null)
  const [tasks, setTasks] = useState<JsonRecord[]>([])
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')

  async function run(kind: 'analysis'|'email'|'tasks', fn: () => Promise<void>) {
    setLoading(kind); setError('')
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.') } finally { setLoading('') }
  }

  const field = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500'
  return <div className="space-y-6">
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold text-white">Call intelligence</h2>
      <p className="mt-1 text-sm text-slate-400">Generate a summary, follow-up, sentiment, call score, objections, coaching, action items, keywords, and next-best action.</p>
      <textarea value={transcript} onChange={(e)=>setTranscript(e.target.value)} rows={10} className={`${field} mt-4`} placeholder="Paste a call transcript..." />
      <button onClick={()=>run('analysis', async()=>{ const d=await post('/api/ai/analyze',{transcript}); setAnalysis(d.analysis as JsonRecord) })} disabled={!!loading} className="mt-4 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{loading==='analysis'?'Analyzing…':'Analyze call'}</button>
      {analysis && <pre className="mt-5 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-200">{JSON.stringify(analysis,null,2)}</pre>}
    </section>

    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold text-white">AI email generation</h2>
      <form className="mt-4 grid gap-3" onSubmit={(e)=>{e.preventDefault(); const f=new FormData(e.currentTarget); run('email',async()=>{const d=await post('/api/ai/email',{recipient:f.get('recipient'),purpose:f.get('purpose'),tone:f.get('tone'),context:f.get('context')});setEmail(d.email as JsonRecord)})}}>
        <input name="recipient" className={field} placeholder="Recipient name" />
        <input name="purpose" required className={field} placeholder="Purpose (follow-up, proposal, check-in...)" />
        <select name="tone" className={field}><option>professional</option><option>friendly</option><option>concise</option><option>persuasive</option></select>
        <textarea name="context" rows={5} className={field} placeholder="Relevant context" />
        <button disabled={!!loading} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{loading==='email'?'Generating…':'Generate email'}</button>
      </form>
      {email && <pre className="mt-5 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-200">{JSON.stringify(email,null,2)}</pre>}
    </section>

    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold text-white">AI task suggestions</h2>
      <form className="mt-4 grid gap-3" onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);run('tasks',async()=>{const d=await post('/api/ai/tasks',{context:f.get('context')});setTasks((d.tasks as JsonRecord[])??[])})}}>
        <textarea name="context" required rows={6} className={field} placeholder="Paste notes, a transcript, or deal context..." />
        <button disabled={!!loading} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{loading==='tasks'?'Suggesting…':'Suggest tasks'}</button>
      </form>
      {tasks.length>0 && <pre className="mt-5 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-200">{JSON.stringify(tasks,null,2)}</pre>}
    </section>
  </div>
}

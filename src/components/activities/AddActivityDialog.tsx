'use client'

import { useRef } from 'react'
import { Activity } from 'lucide-react'
import { createActivity } from '@/app/dashboard/activities/actions'

type ContactOption = { id: string; label: string }

export default function AddActivityDialog({ contactId, contactOptions = [] }: { contactId?: string; contactOptions?: ContactOption[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  return <>
    <button type="button" onClick={() => dialogRef.current?.showModal()} className="inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-400/10 px-4 py-2 text-sm font-medium text-violet-200 hover:bg-violet-400/15"><Activity className="h-4 w-4" />Log Activity</button>
    <dialog ref={dialogRef} className="w-full max-w-xl rounded-2xl bg-[#0B1726] p-0 text-white backdrop:bg-black/60">
      <form action={async (formData) => { await createActivity(formData); dialogRef.current?.close() }}>
        {contactId ? <input type="hidden" name="contactId" value={contactId} /> : <label className="block px-6 pt-6 text-sm text-slate-300">Contact<select name="contactId" required defaultValue="" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"><option value="" disabled>Select contact</option>{contactOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
        <div className="border-b border-white/10 px-6 py-5"><h2 className="text-lg font-semibold">Log CRM activity</h2><p className="mt-1 text-sm text-slate-400">Record a customer interaction without changing existing calls, notes, or tasks.</p></div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm text-slate-300">Subject<input name="subject" required maxLength={300} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white" /></label>
          <label className="text-sm text-slate-300">Type<select name="activityType" defaultValue="other" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3">{['call','email','sms','meeting','note','task','status_change','web','social','other'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
          <label className="text-sm text-slate-300">Direction<select name="direction" defaultValue="internal" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3"><option value="internal">Internal</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></label>
          <label className="text-sm text-slate-300">Status<select name="status" defaultValue="completed" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3">{['planned','in_progress','completed','cancelled','failed'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
          <label className="text-sm text-slate-300">Occurred at<input name="occurredAt" type="datetime-local" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3" /></label>
          <label className="sm:col-span-2 text-sm text-slate-300">Details<textarea name="body" rows={4} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3" /></label>
          <label className="text-sm text-slate-300">Outcome<input name="outcome" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3" /></label>
          <label className="text-sm text-slate-300">Duration (seconds)<input name="durationSeconds" type="number" min="0" max="604800" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3" /></label>
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-5"><button type="button" onClick={() => dialogRef.current?.close()} className="rounded-xl border border-white/10 px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-xl bg-cyan-500 px-5 py-2 text-sm font-medium">Save Activity</button></div>
      </form>
    </dialog>
  </>
}

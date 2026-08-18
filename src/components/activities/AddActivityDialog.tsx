'use client'

import { useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import { createActivity } from '@/app/dashboard/activities/actions'

type Option = { id: string; label: string }
type RelationType = 'contact' | 'company' | 'opportunity'

type Props = {
  contactId?: string
  contactOptions?: Option[]
  companyOptions?: Option[]
  opportunityOptions?: Option[]
}

const fieldClass = 'mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white'

export default function AddActivityDialog({
  contactId,
  contactOptions = [],
  companyOptions = [],
  opportunityOptions = [],
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [relationType, setRelationType] = useState<RelationType>('contact')

  return <>
    <button type="button" onClick={() => dialogRef.current?.showModal()} className="inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-400/10 px-4 py-2 text-sm font-medium text-violet-200 hover:bg-violet-400/15"><Activity className="h-4 w-4" />Log Activity</button>
    <dialog ref={dialogRef} className="w-full max-w-2xl rounded-2xl bg-[#0B1726] p-0 text-white backdrop:bg-black/60">
      <form action={async (formData) => { await createActivity(formData); dialogRef.current?.close() }}>
        <div className="border-b border-white/10 px-6 py-5"><h2 className="text-lg font-semibold">Log CRM activity</h2><p className="mt-1 text-sm text-slate-400">Record a meaningful customer interaction. Calls, completed meetings, and opportunity stage changes are added to this feed automatically.</p></div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          {contactId ? (
            <input type="hidden" name="contactId" value={contactId} />
          ) : (
            <>
              <label className="sm:col-span-2 text-sm text-slate-300">Related record
                <select value={relationType} onChange={(event) => setRelationType(event.target.value as RelationType)} className={fieldClass}>
                  <option value="contact">Contact</option>
                  <option value="company">Company</option>
                  <option value="opportunity">Opportunity</option>
                </select>
              </label>
              {relationType === 'contact' ? <label className="sm:col-span-2 text-sm text-slate-300">Contact<select name="contactId" required defaultValue="" className={fieldClass}><option value="" disabled>Select contact</option>{contactOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label> : null}
              {relationType === 'company' ? <label className="sm:col-span-2 text-sm text-slate-300">Company<select name="companyId" required defaultValue="" className={fieldClass}><option value="" disabled>Select company</option>{companyOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label> : null}
              {relationType === 'opportunity' ? <label className="sm:col-span-2 text-sm text-slate-300">Opportunity<select name="opportunityId" required defaultValue="" className={fieldClass}><option value="" disabled>Select opportunity</option>{opportunityOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label> : null}
            </>
          )}
          <label className="sm:col-span-2 text-sm text-slate-300">Subject<input name="subject" required maxLength={300} className={fieldClass} /></label>
          <label className="text-sm text-slate-300">Type<select name="activityType" defaultValue="other" className={fieldClass}>{['call','email','sms','meeting','note','task','status_change','web','social','other'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
          <label className="text-sm text-slate-300">Direction<select name="direction" defaultValue="internal" className={fieldClass}><option value="internal">Internal</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></label>
          <label className="text-sm text-slate-300">Status<select name="status" defaultValue="completed" className={fieldClass}>{['planned','in_progress','completed','cancelled','failed'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
          <label className="sm:col-span-2 text-sm text-slate-300">Occurred at<input name="occurredAt" type="datetime-local" className={fieldClass} /></label>
          <label className="sm:col-span-2 text-sm text-slate-300">Details<textarea name="body" rows={4} className={fieldClass} /></label>
          <label className="text-sm text-slate-300">Outcome<input name="outcome" className={fieldClass} /></label>
          <label className="text-sm text-slate-300">Duration (seconds)<input name="durationSeconds" type="number" min="0" max="604800" className={fieldClass} /></label>
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-5"><button type="button" onClick={() => dialogRef.current?.close()} className="rounded-xl border border-white/10 px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-xl bg-cyan-500 px-5 py-2 text-sm font-medium">Save Activity</button></div>
      </form>
    </dialog>
  </>
}

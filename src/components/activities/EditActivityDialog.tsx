'use client'

import { useRef, useState } from 'react'
import { Pencil } from 'lucide-react'

import { updateActivity } from '@/app/dashboard/activities/actions'
import type { CrmActivity } from '@/lib/activities'

type Option = { id: string; label: string }
type RelationType = 'contact' | 'company' | 'opportunity'

type Props = {
  activity: CrmActivity
  contactOptions: Option[]
  companyOptions: Option[]
  opportunityOptions: Option[]
  occurredAtLocal: string
}

const fieldClass = 'mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white'

function initialRelationType(activity: CrmActivity): RelationType {
  if (activity.company_id) return 'company'
  if (activity.opportunity_id) return 'opportunity'
  return 'contact'
}

export default function EditActivityDialog({
  activity,
  contactOptions,
  companyOptions,
  opportunityOptions,
  occurredAtLocal,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [relationType, setRelationType] = useState<RelationType>(initialRelationType(activity))

  return <>
    <button type="button" onClick={() => dialogRef.current?.showModal()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/30 hover:text-white"><Pencil className="h-4 w-4" />Edit</button>
    <dialog ref={dialogRef} className="w-full max-w-2xl rounded-2xl bg-[#0B1726] p-0 text-white backdrop:bg-black/60">
      <form action={async (formData) => { await updateActivity(formData); dialogRef.current?.close() }}>
        <input type="hidden" name="activityId" value={activity.id} />
        <div className="border-b border-white/10 px-6 py-5"><h2 className="text-lg font-semibold">Edit activity</h2><p className="mt-1 text-sm text-slate-400">Only manually logged activities can be edited.</p></div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm text-slate-300">Related record
            <select value={relationType} onChange={(event) => setRelationType(event.target.value as RelationType)} className={fieldClass}>
              <option value="contact">Contact</option>
              <option value="company">Company</option>
              <option value="opportunity">Opportunity</option>
            </select>
          </label>
          {relationType === 'contact' ? <label className="sm:col-span-2 text-sm text-slate-300">Contact<select name="contactId" required defaultValue={activity.contact_id ?? ''} className={fieldClass}><option value="" disabled>Select contact</option>{contactOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label> : null}
          {relationType === 'company' ? <label className="sm:col-span-2 text-sm text-slate-300">Company<select name="companyId" required defaultValue={activity.company_id ?? ''} className={fieldClass}><option value="" disabled>Select company</option>{companyOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label> : null}
          {relationType === 'opportunity' ? <label className="sm:col-span-2 text-sm text-slate-300">Opportunity<select name="opportunityId" required defaultValue={activity.opportunity_id ?? ''} className={fieldClass}><option value="" disabled>Select opportunity</option>{opportunityOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label> : null}
          <label className="sm:col-span-2 text-sm text-slate-300">Subject<input name="subject" required maxLength={300} defaultValue={activity.subject} className={fieldClass} /></label>
          <label className="text-sm text-slate-300">Type<select name="activityType" defaultValue={activity.activity_type} className={fieldClass}>{['call','email','sms','meeting','note','task','status_change','web','social','other'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
          <label className="text-sm text-slate-300">Direction<select name="direction" defaultValue={activity.direction} className={fieldClass}><option value="internal">Internal</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></label>
          <label className="text-sm text-slate-300">Status<select name="status" defaultValue={activity.status} className={fieldClass}>{['planned','in_progress','completed','cancelled','failed'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
          <label className="sm:col-span-2 text-sm text-slate-300">Occurred at<input name="occurredAt" type="datetime-local" defaultValue={occurredAtLocal} className={fieldClass} /></label>
          <label className="sm:col-span-2 text-sm text-slate-300">Details<textarea name="body" rows={4} defaultValue={activity.body ?? ''} className={fieldClass} /></label>
          <label className="text-sm text-slate-300">Outcome<input name="outcome" defaultValue={activity.outcome ?? ''} className={fieldClass} /></label>
          <label className="text-sm text-slate-300">Duration (seconds)<input name="durationSeconds" type="number" min="0" max="604800" defaultValue={activity.duration_seconds ?? ''} className={fieldClass} /></label>
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-5"><button type="button" onClick={() => dialogRef.current?.close()} className="rounded-xl border border-white/10 px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-xl bg-cyan-500 px-5 py-2 text-sm font-medium">Save changes</button></div>
      </form>
    </dialog>
  </>
}

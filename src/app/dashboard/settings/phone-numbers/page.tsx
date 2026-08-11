import { Smartphone } from 'lucide-react'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import { requirePermission } from '@/lib/auth'
import {
  addPhoneNumber,
  configurePhoneNumberInboundRoute,
  removePhoneNumber,
  setDefaultPhoneNumber,
} from './actions'

export default async function PhoneNumbersPage() {
  await requirePermission('settings.manage')
  const { supabase, organizationId, role } = await requireSettingsContext()
  const manageable = canManageSettings(role)
  const [{ data: numbers, error: numbersError }, { data: groups }, { data: queues }] = await Promise.all([
    supabase.from('organization_phone_numbers').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    supabase.from('ring_groups').select('id,name').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('call_queues').select('id,name').eq('organization_id', organizationId).eq('is_active', true).order('name'),
  ])
  if (numbersError) throw new Error(numbersError.message)

  return <div className="space-y-8">
    <div><h1 className="text-3xl font-bold">Phone Numbers</h1><p className="mt-2 text-muted-foreground">Assign provider numbers, capabilities, default caller ID, and inbound Ring Group or Queue routing.</p></div>
    {manageable ? <form action={addPhoneNumber} className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3"><Smartphone className="h-5 w-5 text-primary"/><h2 className="text-xl font-semibold">Add phone number</h2></div>
      <div className="mt-5 grid gap-4 md:grid-cols-3"><input name="friendly_name" placeholder="Sales line" className="rounded-lg border bg-background px-3 py-2"/><input name="phone_number" required placeholder="+15551234567" className="rounded-lg border bg-background px-3 py-2"/><select name="provider" className="rounded-lg border bg-background px-3 py-2"><option>twilio</option><option>telnyx</option><option>signalwire</option><option>plivo</option></select></div>
      <div className="mt-4 flex gap-5 text-sm"><label><input type="checkbox" name="voice" defaultChecked/> Voice</label><label><input type="checkbox" name="sms" defaultChecked/> SMS</label></div>
      <button className="mt-5 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Add Number</button>
    </form> : null}
    <div className="grid gap-4">{(numbers ?? []).map((n) => <article key={n.id} className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="font-semibold">{n.friendly_name}</h2>{n.is_default?<span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">Default</span>:null}</div><p className="mt-1 font-mono text-sm">{n.phone_number}</p><p className="mt-1 text-sm text-muted-foreground capitalize">{n.provider} · {Object.entries((n.capabilities??{}) as Record<string,boolean>).filter(([,v])=>v).map(([k])=>k).join(', ')}</p></div>
        {manageable?<div className="flex gap-3">{!n.is_default?<form action={setDefaultPhoneNumber}><input type="hidden" name="id" value={n.id}/><button className="rounded-lg border px-3 py-2 text-sm">Set default</button></form>:null}<form action={removePhoneNumber}><input type="hidden" name="id" value={n.id}/><button className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">Remove</button></form></div>:null}</div>
        <div className="rounded-xl border border-border bg-background/40 p-4"><h3 className="font-medium">Inbound routing</h3><p className="mt-1 text-sm text-muted-foreground">The same Ring Group/Queue model is used for Twilio, Telnyx, SignalWire, and Plivo.</p>
        {manageable?<form action={configurePhoneNumberInboundRoute} className="mt-4 flex flex-col gap-3 sm:flex-row"><input type="hidden" name="phone_number_id" value={n.id}/><select name="inbound_route" defaultValue={n.inbound_route || 'none'} className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2"><option value="none">No inbound route</option>{(groups??[]).map(g=><option key={g.id} value={`ring_group:${g.id}`}>Ring group — {g.name}</option>)}{(queues??[]).map(q=><option key={q.id} value={`queue:${q.id}`}>Queue — {q.name}</option>)}</select><button className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Save inbound route</button></form>:<p className="mt-3 text-sm">{n.inbound_route || 'No inbound route'}</p>}</div>
      </div>
    </article>)}{!numbers?.length?<p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No phone numbers configured.</p>:null}</div>
  </div>
}

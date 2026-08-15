import { Smartphone } from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import { configurePhoneNumberInboundRoute, setDefaultPhoneNumber } from './actions'

export default async function PhoneNumbersPage() {
  await requirePermission('settings.manage')
  const { supabase, organizationId, role } = await requireSettingsContext()
  const manageable = canManageSettings(role)

  const [{ data: numbers, error: numbersError }, { data: groups }, { data: queues }] = await Promise.all([
    supabase.from('organization_phone_numbers').select('*').eq('organization_id', organizationId).eq('provider', 'signalwire').order('created_at', { ascending: false }),
    supabase.from('ring_groups').select('id,name').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('call_queues').select('id,name').eq('organization_id', organizationId).eq('is_active', true).order('name'),
  ])
  if (numbersError) throw new Error(numbersError.message)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Phone Numbers</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          View the Flowtix numbers assigned to your workspace, choose the default caller ID, and route inbound calls. Number provisioning is managed securely by Flowtix.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Flowtix-managed calling</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Carrier credentials, provider connections, number purchasing, importing, and release controls are managed by the Flowtix platform and are not exposed to workspace users.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4">
        {(numbers ?? []).map((n) => (
          <article key={n.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{n.friendly_name}</h2>
                    {n.is_default ? <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">Default caller ID</span> : null}
                  </div>
                  <p className="mt-1 font-mono text-sm">{n.phone_number}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {Object.entries((n.capabilities ?? {}) as Record<string, boolean>).filter(([, value]) => value).map(([key]) => key.toUpperCase()).join(' · ') || 'Calling'}
                  </p>
                </div>
                {manageable && !n.is_default ? (
                  <form action={setDefaultPhoneNumber}>
                    <input type="hidden" name="id" value={n.id} />
                    <button className="rounded-lg border px-3 py-2 text-sm">Set default caller ID</button>
                  </form>
                ) : null}
              </div>

              <div className="rounded-xl border border-border bg-background/40 p-4">
                <h3 className="font-medium">Inbound routing</h3>
                <p className="mt-1 text-sm text-muted-foreground">Route calls for this Flowtix number to a Ring Group or Queue in this workspace.</p>
                {manageable ? (
                  <form action={configurePhoneNumberInboundRoute} className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input type="hidden" name="phone_number_id" value={n.id} />
                    <select name="inbound_route" defaultValue={n.inbound_route || 'none'} className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2">
                      <option value="none">No inbound route</option>
                      {(groups ?? []).map((group) => <option key={group.id} value={`ring_group:${group.id}`}>Ring group — {group.name}</option>)}
                      {(queues ?? []).map((queue) => <option key={queue.id} value={`queue:${queue.id}`}>Queue — {queue.name}</option>)}
                    </select>
                    <button className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Save inbound route</button>
                  </form>
                ) : <p className="mt-3 text-sm">{n.inbound_route || 'No inbound route'}</p>}
              </div>
            </div>
          </article>
        ))}
        {!numbers?.length ? <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No Flowtix phone number has been assigned to this workspace yet.</p> : null}
      </div>
    </div>
  )
}

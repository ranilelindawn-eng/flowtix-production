import { Smartphone } from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import { setDefaultPhoneNumber } from './actions'

export default async function PhoneNumbersPage() {
  await requirePermission('settings.manage')
  const { supabase, organizationId, role } = await requireSettingsContext()
  const manageable = canManageSettings(role)

  const { data: numbers, error: numbersError } = await supabase
    .from('organization_phone_numbers')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('provider', 'signalwire')
    .order('created_at', { ascending: false })

  if (numbersError) throw new Error(numbersError.message)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Phone Numbers</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          View the Flowtix numbers assigned to your workspace and choose the default outbound caller ID. Number provisioning is managed securely by Flowtix.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Flowtix-managed outbound calling</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Carrier credentials, provider connections, number purchasing, importing, and release controls are managed by the Flowtix platform and are not exposed to workspace users.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4">
        {(numbers ?? []).map((number) => (
          <article key={number.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{number.friendly_name}</h2>
                  {number.is_default ? (
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                      Default caller ID
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 font-mono text-sm">{number.phone_number}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Outbound voice
                </p>
              </div>

              {manageable && !number.is_default ? (
                <form action={setDefaultPhoneNumber}>
                  <input type="hidden" name="id" value={number.id} />
                  <button className="rounded-lg border px-3 py-2 text-sm">
                    Set default caller ID
                  </button>
                </form>
              ) : null}
            </div>
          </article>
        ))}

        {!numbers?.length ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            No Flowtix outbound caller ID has been assigned to this workspace yet.
          </p>
        ) : null}
      </div>
    </div>
  )
}

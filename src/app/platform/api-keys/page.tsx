import { KeyRound } from 'lucide-react'

import PlatformApiKeyManager from './PlatformApiKeyManager'
import { requirePlatformPermission } from '@/lib/platform/auth'
import { getPlatformApiKeys } from '@/lib/platform/api-keys'
import { getPlatformCustomers } from '@/lib/platform/customers'

type Props = {
  searchParams: Promise<{
    organizationId?: string
    search?: string
  }>
}

export default async function PlatformApiKeysPage({ searchParams }: Props) {
  await requirePlatformPermission('platform.api_keys.manage')

  const params = await searchParams
  const search = params.search?.trim() ?? ''
  const organizationId = params.organizationId?.trim() ?? ''
  const customers = await getPlatformCustomers({
    search: search || undefined,
    status: 'all',
    limit: 100,
  })

  const directory = organizationId
    ? await getPlatformApiKeys(organizationId)
    : null

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3 text-blue-300">
          <KeyRound className="h-5 w-5" />
          <p className="text-sm font-medium">Developer credentials</p>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">API Keys</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Create and revoke organization-scoped Flowtix API credentials from the staff-only developer environment. Customer workspace users cannot manage these credentials.
        </p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <form action="/platform/api-keys" method="get" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)_auto]">
          <div>
            <label className="text-sm font-medium text-slate-200" htmlFor="organization-search">Search organizations</label>
            <input
              id="organization-search"
              name="search"
              defaultValue={search}
              placeholder="Organization name or owner"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2.5 text-white outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-200" htmlFor="organizationId">Organization</label>
            <select
              id="organizationId"
              name="organizationId"
              defaultValue={organizationId}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2.5 text-white outline-none focus:border-blue-400"
            >
              <option value="">Choose organization</option>
              {customers.items.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} · {customer.owner?.email ?? customer.id}
                </option>
              ))}
            </select>
          </div>

          <button className="self-end rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10">
            Open
          </button>
        </form>

        {customers.total > customers.items.length ? (
          <p className="mt-3 text-xs text-slate-500">
            Showing the first {customers.items.length} matching organizations. Narrow the search to locate additional customers.
          </p>
        ) : null}
      </section>

      {directory ? (
        <PlatformApiKeyManager
          organizationId={directory.organizationId}
          organizationName={directory.organizationName}
          timezone={directory.timezone}
          keys={directory.keys}
        />
      ) : (
        <section className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">
          Choose an organization to manage its API credentials.
        </section>
      )}
    </div>
  )
}

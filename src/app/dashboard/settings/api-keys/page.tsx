import { KeyRound } from 'lucide-react'
import { assertEntitlement } from '@/lib/entitlements'
import { requirePermission } from '@/lib/auth'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import { createApiKey, revokeApiKey } from './actions'

export default async function ApiKeysPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission('api_keys.view')
  const { supabase, organizationId, role } = await requireSettingsContext()
  await assertEntitlement('api.access', organizationId)
  const query = await searchParams
  const created = typeof query.created === 'string' ? query.created : null
  const { data: keys } = await supabase.from('api_keys').select('id,name,key_prefix,scopes,last_used_at,created_at,revoked_at').eq('organization_id', organizationId).order('created_at', { ascending: false })
  const manageable = canManageSettings(role)
  return <div className="space-y-8"><div><h1 className="text-3xl font-bold">API Keys</h1><p className="mt-2 text-muted-foreground">Create and revoke organization API credentials. Secret values are stored only as hashes.</p></div>
  {created ? <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-5"><p className="font-semibold">Copy this key now. It will not be displayed again.</p><code className="mt-3 block break-all rounded-lg bg-background p-3 text-sm">{created}</code></div> : null}
  {manageable ? <form action={createApiKey} className="rounded-xl border border-border bg-card p-6"><div className="flex items-center gap-3"><KeyRound className="h-5 w-5 text-primary"/><h2 className="text-xl font-semibold">Create API key</h2></div><div className="mt-5 grid gap-4 md:grid-cols-2"><input name="name" required placeholder="Production integration" className="rounded-lg border bg-background px-3 py-2"/><div className="flex flex-wrap gap-3 text-sm">{['contacts:read','contacts:write','calls:read','calls:write','reports:read'].map(scope => <label key={scope} className="flex items-center gap-2"><input type="checkbox" name="scopes" value={scope}/>{scope}</label>)}</div></div><button className="mt-5 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Create Key</button></form> : null}
  <div className="overflow-hidden rounded-xl border border-border bg-card"><table className="w-full text-left text-sm"><thead className="bg-muted/50"><tr><th className="p-4">Name</th><th className="p-4">Prefix</th><th className="p-4">Scopes</th><th className="p-4">Last used</th><th className="p-4">Status</th><th className="p-4"></th></tr></thead><tbody>{(keys ?? []).map(key => <tr key={key.id} className="border-t border-border"><td className="p-4 font-medium">{key.name}</td><td className="p-4 font-mono">{key.key_prefix}…</td><td className="p-4">{(key.scopes ?? []).join(', ') || 'None'}</td><td className="p-4 text-muted-foreground">{key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}</td><td className="p-4">{key.revoked_at ? 'Revoked' : 'Active'}</td><td className="p-4">{manageable && !key.revoked_at ? <form action={revokeApiKey}><input type="hidden" name="id" value={key.id}/><button className="text-destructive hover:underline">Revoke</button></form> : null}</td></tr>)}</tbody></table>{!keys?.length ? <p className="p-6 text-muted-foreground">No API keys created.</p> : null}</div></div>
}

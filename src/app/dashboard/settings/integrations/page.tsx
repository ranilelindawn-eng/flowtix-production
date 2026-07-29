import Link from 'next/link'
import { CalendarDays, CheckCircle2, CircleOff, Mail, MessageSquare, Phone, Plug, Sparkles, Video, Workflow } from 'lucide-react'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import { disconnectIntegration } from './actions'

type SearchParams = Promise<Record<string, string | string[] | undefined>>
type IntegrationRow = {
  provider: string
  enabled: boolean
  status: string
  config: Record<string, unknown> | null
  connected_at: string | null
  last_error: string | null
}

const cards = [
  { provider: 'gmail', name: 'Gmail', description: 'Send and sync subscriber email through their own Google account.', icon: Mail, method: 'oauth', ready: true },
  { provider: 'google-calendar', name: 'Google Calendar', description: 'Sync meetings and CRM activities with the subscriber calendar.', icon: CalendarDays, method: 'oauth', ready: false },
  { provider: 'outlook', name: 'Outlook', description: 'Connect a subscriber Microsoft mailbox using Microsoft OAuth.', icon: Mail, method: 'oauth', ready: false },
  { provider: 'microsoft-teams', name: 'Microsoft Teams', description: 'Connect the subscriber Microsoft 365 organization and Teams workspace.', icon: MessageSquare, method: 'oauth', ready: false },
  { provider: 'slack', name: 'Slack', description: 'Install CallFlow into the subscriber Slack workspace.', icon: MessageSquare, method: 'oauth', ready: false },
  { provider: 'zoom', name: 'Zoom', description: 'Authorize the subscriber Zoom account for meetings and activities.', icon: Video, method: 'oauth', ready: false },
  { provider: 'twilio', name: 'Twilio', description: 'Use the subscriber Twilio account, numbers, and voice credentials.', icon: Phone, method: 'credentials', ready: false },
  { provider: 'telnyx', name: 'Telnyx', description: 'Use the subscriber Telnyx API key and voice connection.', icon: Phone, method: 'credentials', ready: false },
  { provider: 'signalwire', name: 'SignalWire', description: 'Use the subscriber SignalWire project and space.', icon: Phone, method: 'credentials', ready: false },
  { provider: 'plivo', name: 'Plivo', description: 'Use the subscriber Plivo account and phone numbers.', icon: Phone, method: 'credentials', ready: false },
  { provider: 'openai', name: 'OpenAI', description: 'Use platform-managed AI or a subscriber-owned API key.', icon: Sparkles, method: 'credentials', ready: false },
  { provider: 'n8n', name: 'n8n', description: 'Connect subscriber-owned n8n workflows with signed webhooks.', icon: Workflow, method: 'webhook', ready: false },
  { provider: 'zapier', name: 'Zapier', description: 'Connect subscriber automations through a published app or webhook.', icon: Plug, method: 'webhook', ready: false },
] as const

export default async function IntegrationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const { supabase, organizationId, role } = await requireSettingsContext()
  const manageable = canManageSettings(role)
  const { data } = await supabase
    .from('organization_integrations')
    .select('provider,enabled,status,config,connected_at,last_error')
    .eq('organization_id', organizationId)

  const byProvider = new Map(((data ?? []) as IntegrationRow[]).map((item) => [item.provider, item]))
  const connected = typeof params.connected === 'string' ? params.connected : null
  const error = typeof params.error === 'string' ? params.error : null

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Subscriber-owned connections</p>
        <h1 className="mt-2 text-3xl font-bold">Integrations</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Each organization connects its own provider account. Connections, identities, and encrypted credentials are isolated by organization.
        </p>
      </div>

      {connected ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{connected === 'gmail' ? 'Gmail connected successfully.' : 'Integration connected successfully.'}</div> : null}
      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">The connection could not be completed ({error}). Check the provider configuration and try again.</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => {
          const item = byProvider.get(card.provider)
          const config = item?.config ?? {}
          const connectedEmail = typeof config.connected_email === 'string' ? config.connected_email : null
          const isConnected = item?.status === 'connected' && item.enabled
          const Icon = card.icon

          return (
            <section key={card.provider} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5"><Icon className="h-5 w-5 text-primary" /></div>
                  <div>
                    <h2 className="font-semibold">{card.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{card.description}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${isConnected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-border bg-muted/40 text-muted-foreground'}`}>
                  {isConnected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleOff className="h-3.5 w-3.5" />}
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              <div className="mt-5 rounded-xl border border-border bg-background/50 p-4 text-sm">
                {isConnected ? (
                  <div className="space-y-1">
                    <p className="font-medium">{connectedEmail ?? 'Provider account connected'}</p>
                    <p className="text-muted-foreground">Connected {item?.connected_at ? new Date(item.connected_at).toLocaleString() : 'successfully'}</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="font-medium">Connection method: {card.method === 'oauth' ? 'Secure OAuth authorization' : card.method === 'credentials' ? 'Encrypted provider credentials' : 'Signed webhook'}</p>
                    <p className="text-muted-foreground">No subscriber account is connected.</p>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {card.provider === 'gmail' && !isConnected && manageable ? (
                  <Link href="/api/integrations/google/connect?service=gmail" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Connect Gmail</Link>
                ) : null}
                {isConnected && manageable ? (
                  <form action={disconnectIntegration}>
                    <input type="hidden" name="provider" value={card.provider} />
                    <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Disconnect</button>
                  </form>
                ) : null}
                {!card.ready && !isConnected ? <span className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground">Provider-specific connection coming next</span> : null}
              </div>

              {!manageable ? <p className="mt-3 text-xs text-muted-foreground">Only organization owners and admins can manage integrations.</p> : null}
              {item?.last_error ? <p className="mt-3 text-xs text-red-300">Last error: {item.last_error}</p> : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}

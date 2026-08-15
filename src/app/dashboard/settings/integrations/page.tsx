import {
  CalendarDays,
  CheckCircle2,
  CircleOff,
  Mail,
  MessageSquare,
  Video,
} from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { getCurrentOrganizationTimezone } from '@/lib/team'
import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import {
  disconnectIntegration,
  testGmailIntegration,
  testGoogleCalendarIntegration,
} from './actions'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

type IntegrationRow = {
  provider: string
  enabled: boolean
  status: string
  config: Record<string, unknown> | null
  connected_at: string | null
}

type Card = {
  provider: string
  name: string
  description: string
  icon: typeof Mail
  href: string
}

const cards: Card[] = [
  { provider: 'gmail', name: 'Gmail', description: 'Send and sync email through the Google account selected by the subscriber.', icon: Mail, href: '/api/integrations/google/connect?service=gmail' },
  { provider: 'google-calendar', name: 'Google Calendar', description: 'Sync meetings and CRM activities with the selected Google calendar.', icon: CalendarDays, href: '/api/integrations/google/connect?service=google-calendar' },
  { provider: 'outlook', name: 'Outlook', description: 'Connect a subscriber Microsoft mailbox using Microsoft OAuth.', icon: Mail, href: '/api/integrations/oauth/connect?provider=outlook' },
  { provider: 'microsoft-teams', name: 'Microsoft Teams', description: 'Connect a Microsoft 365 organization and Teams workspace.', icon: MessageSquare, href: '/api/integrations/oauth/connect?provider=microsoft-teams' },
  { provider: 'slack', name: 'Slack', description: 'Install Flowtix into the subscriber Slack workspace.', icon: MessageSquare, href: '/api/integrations/oauth/connect?provider=slack' },
  { provider: 'zoom', name: 'Zoom', description: 'Authorize the subscriber Zoom account for meetings and activities.', icon: Video, href: '/api/integrations/oauth/connect?provider=zoom' },
]

export default async function IntegrationsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission('settings.manage')
  const timeZone = await getCurrentOrganizationTimezone()
  const params = await searchParams
  const { supabase, organizationId, role } = await requireSettingsContext()
  const manageable = canManageSettings(role)

  const { data } = await supabase
    .from('organization_integrations')
    .select('provider,enabled,status,config,connected_at')
    .eq('organization_id', organizationId)
    .neq('provider', 'signalwire')

  const byProvider = new Map(((data ?? []) as IntegrationRow[]).map((item) => [item.provider, item]))
  const connected = typeof params.connected === 'string' ? params.connected : null
  const error = typeof params.error === 'string' ? params.error : null

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Workspace integrations</p>
        <h1 className="mt-2 text-3xl font-bold">Integrations</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Connect the business applications your workspace uses. Flowtix Cloud Calling is managed securely by the platform and requires no carrier setup from subscribers.
        </p>
      </div>

      {connected ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{connected} connected successfully.</div> : null}
      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">Connection failed: {error}. Confirm the application authorization and try again.</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => {
          const item = byProvider.get(card.provider)
          const config = item?.config ?? {}
          const connectedIdentity = typeof config.connected_email === 'string' ? config.connected_email : typeof config.connected_name === 'string' ? config.connected_name : null
          const isConnected = item?.status === 'connected' && item.enabled
          const Icon = card.icon

          return (
            <section key={card.provider} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5"><Icon className="h-5 w-5 text-primary" /></div>
                  <div><h2 className="font-semibold">{card.name}</h2><p className="mt-1 text-sm text-muted-foreground">{card.description}</p></div>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${isConnected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-border bg-muted/40 text-muted-foreground'}`}>
                  {isConnected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleOff className="h-3.5 w-3.5" />}
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              <div className="mt-5 rounded-xl border border-border bg-background/50 p-4 text-sm">
                {isConnected ? (
                  <div className="space-y-1"><p className="font-medium">{connectedIdentity ?? 'Account connected'}</p><p className="text-muted-foreground">Connected {item?.connected_at ? new Date(item.connected_at).toLocaleString('en-US', { timeZone }) : 'successfully'}</p></div>
                ) : (
                  <div className="space-y-1"><p className="font-medium">Secure OAuth authorization</p><p className="text-muted-foreground">No account is connected.</p></div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {!isConnected && manageable ? <a href={card.href} className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Connect {card.name}</a> : null}
                {isConnected && manageable && card.provider === 'gmail' ? <form action={testGmailIntegration}><button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Send test email</button></form> : null}
                {isConnected && manageable && card.provider === 'google-calendar' ? <form action={testGoogleCalendarIntegration}><button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Create test event</button></form> : null}
                {isConnected && manageable ? <form action={disconnectIntegration}><input type="hidden" name="provider" value={card.provider} /><button className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Disconnect</button></form> : null}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

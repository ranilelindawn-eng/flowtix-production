import Link from 'next/link'
import {
  CalendarDays,
  CheckCircle2,
  CircleOff,
  Mail,
  MessageSquare,
  Phone,
  Video,
} from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { getCurrentOrganizationTimezone } from '@/lib/team'

import {
  canManageSettings,
  requireSettingsContext,
} from '@/lib/settings-context'

import {
  disconnectIntegration,
  saveCredentialIntegration,
  setDefaultTelephonyPhoneNumber,
  syncTelephonyPhoneNumbers,
  testGmailIntegration,
  testGoogleCalendarIntegration,
  testTelephonyIntegration,
} from './actions'

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>

type IntegrationRow = {
  provider: string
  enabled: boolean
  status: string
  config: Record<string, unknown> | null
  connected_at: string | null
  last_error: string | null
  last_tested_at: string | null
  last_test_status: string | null
}

type PhoneNumberRow = {
  phone_number: string
  friendly_name: string
  capabilities: Record<string, boolean> | null
  is_default: boolean
}

type Field = {
  name: string
  label: string
  type?: string
  placeholder?: string
}

type Card = {
  provider: string
  name: string
  description: string
  icon: typeof Mail
  method: 'oauth' | 'credentials' | 'webhook'
  href?: string
  fields?: Field[]
}

const cards: Card[] = [
  {
    provider: 'gmail',
    name: 'Gmail',
    description:
      'Send and sync email through the Google account selected by the subscriber.',
    icon: Mail,
    method: 'oauth',
    href: '/api/integrations/google/connect?service=gmail',
  },
  {
    provider: 'google-calendar',
    name: 'Google Calendar',
    description:
      'Sync meetings and CRM activities with the selected Google calendar.',
    icon: CalendarDays,
    method: 'oauth',
    href: '/api/integrations/google/connect?service=google-calendar',
  },
  {
    provider: 'outlook',
    name: 'Outlook',
    description:
      'Connect a subscriber Microsoft mailbox using Microsoft OAuth.',
    icon: Mail,
    method: 'oauth',
    href: '/api/integrations/oauth/connect?provider=outlook',
  },
  {
    provider: 'microsoft-teams',
    name: 'Microsoft Teams',
    description:
      'Connect a Microsoft 365 organization and Teams workspace.',
    icon: MessageSquare,
    method: 'oauth',
    href: '/api/integrations/oauth/connect?provider=microsoft-teams',
  },
  {
    provider: 'slack',
    name: 'Slack',
    description:
      'Install Flowtix into the subscriber Slack workspace.',
    icon: MessageSquare,
    method: 'oauth',
    href: '/api/integrations/oauth/connect?provider=slack',
  },
  {
    provider: 'zoom',
    name: 'Zoom',
    description:
      'Authorize the subscriber Zoom account for meetings and activities.',
    icon: Video,
    method: 'oauth',
    href: '/api/integrations/oauth/connect?provider=zoom',
  },
  {
    provider: 'twilio',
    name: 'Twilio',
    description:
      'Connect the subscriber Twilio account, then securely import its owned phone numbers.',
    icon: Phone,
    method: 'credentials',
    fields: [
      {
        name: 'accountSid',
        label: 'Account SID',
      },
      {
        name: 'authToken',
        label: 'Auth Token',
        type: 'password',
      },
      {
        name: 'apiKeySid',
        label: 'API Key SID',
      },
      {
        name: 'apiKeySecret',
        label: 'API Key Secret',
        type: 'password',
      },
      {
        name: 'twimlAppSid',
        label: 'TwiML App SID',
      },
    ],
  },
  {
    provider: 'telnyx',
    name: 'Telnyx',
    description:
      'Connect the subscriber Telnyx API key and Credential SIP Connection. Flowtix securely creates the browser credential automatically.',
    icon: Phone,
    method: 'credentials',
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
      },
      {
        name: 'config_connection_id',
        label: 'Credential Connection ID',
      },
    ],
  },
  {
    provider: 'signalwire',
    name: 'SignalWire',
    description:
      'Connect the subscriber SignalWire project and space. Flowtix securely creates short-lived browser JWTs for WebRTC calling.',
    icon: Phone,
    method: 'credentials',
    fields: [
      {
        name: 'projectId',
        label: 'Project ID',
      },
      {
        name: 'apiToken',
        label: 'API Token',
        type: 'password',
      },
      {
        name: 'config_space_url',
        label: 'Space URL',
      },
    ],
  },
  {
    provider: 'plivo',
    name: 'Plivo',
    description:
      'Use the subscriber Plivo account, endpoint, and owned phone numbers.',
    icon: Phone,
    method: 'credentials',
    fields: [
      {
        name: 'authId',
        label: 'Auth ID',
      },
      {
        name: 'authToken',
        label: 'Auth Token',
        type: 'password',
      },
      {
        name: 'endpointUsername',
        label: 'Endpoint Username',
      },
      {
        name: 'endpointPassword',
        label: 'Endpoint Password',
        type: 'password',
      },
    ],
  },
]

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requirePermission('settings.manage')
  const timeZone = await getCurrentOrganizationTimezone()
  const params = await searchParams

  const {
    supabase,
    organizationId,
    role,
  } = await requireSettingsContext()

  const manageable = canManageSettings(role)

  const { data } = await supabase
    .from('organization_integrations')
    .select(
      `
        provider,
        enabled,
        status,
        config,
        connected_at,
        last_error,
        last_tested_at,
        last_test_status
      `,
    )
    .eq('organization_id', organizationId)

  const { data: phoneNumberData } =
    await supabase
      .from('organization_phone_numbers')
      .select(
        `
          provider,
          phone_number,
          friendly_name,
          capabilities,
          is_default
        `,
      )
      .eq('organization_id', organizationId)
      .order('is_default', {
        ascending: false,
      })
      .order('friendly_name')

  const phoneNumbers =
    (phoneNumberData ?? []) as Array<
      PhoneNumberRow & {
        provider: string
      }
    >

  const byProvider = new Map(
    ((data ?? []) as IntegrationRow[]).map(
      (item) => [item.provider, item],
    ),
  )

  const connected =
    typeof params.connected === 'string'
      ? params.connected
      : null

  const error =
    typeof params.error === 'string'
      ? params.error
      : null

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          Subscriber-owned connections
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Integrations
        </h1>

        <p className="mt-2 max-w-3xl text-muted-foreground">
          Each organization connects its own
          provider accounts. Provider identities
          and encrypted credentials are isolated
          by organization.
        </p>
      </div>

      {connected ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {connected} connected successfully.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Connection failed: {error}. Confirm the
          provider app and production environment
          variables are configured.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => {
          const item = byProvider.get(
            card.provider,
          )

          const config = item?.config ?? {}

          const connectedIdentity =
            typeof config.connected_email ===
            'string'
              ? config.connected_email
              : typeof config.connected_name ===
                  'string'
                ? config.connected_name
                : null

          const isConnected =
            item?.status === 'connected' &&
            item.enabled

          const Icon = card.icon

          return (
            <section
              key={card.provider}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>

                  <div>
                    <h2 className="font-semibold">
                      {card.name}
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {card.description}
                    </p>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                    isConnected
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-border bg-muted/40 text-muted-foreground'
                  }`}
                >
                  {isConnected ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <CircleOff className="h-3.5 w-3.5" />
                  )}

                  {isConnected
                    ? 'Connected'
                    : 'Disconnected'}
                </span>
              </div>

              <div className="mt-5 rounded-xl border border-border bg-background/50 p-4 text-sm">
                {isConnected ? (
                  <div className="space-y-1">
                    <p className="font-medium">
                      {connectedIdentity ??
                        'Provider account connected'}
                    </p>

                    <p className="text-muted-foreground">
                      Connected{' '}
                      {item?.connected_at
                        ? new Date(
                            item.connected_at,
                          ).toLocaleString('en-US', { timeZone })
                        : 'successfully'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="font-medium">
                      Connection method:{' '}
                      {card.method === 'oauth'
                        ? 'Secure OAuth authorization'
                        : card.method ===
                            'credentials'
                          ? 'Encrypted provider credentials'
                          : 'Signed webhook'}
                    </p>

                    <p className="text-muted-foreground">
                      No subscriber account is
                      connected.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4">
                {!isConnected &&
                manageable &&
                card.href ? (
                  <a
                    href={card.href}
                    className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Connect {card.name}
                  </a>
                ) : null}

                {!isConnected &&
                manageable &&
                card.fields ? (
                  <form
                    action={
                      saveCredentialIntegration
                    }
                    className="grid gap-3"
                  >
                    <input
                      type="hidden"
                      name="provider"
                      value={card.provider}
                    />

                    {card.fields.map(
                      (field) => (
                        <label
                          key={field.name}
                          className="grid gap-1 text-sm"
                        >
                          <span className="font-medium">
                            {field.label}
                          </span>

                          <input
                            required
                            name={field.name}
                            type={
                              field.type ?? 'text'
                            }
                            placeholder={
                              field.placeholder
                            }
                            className="rounded-lg border border-border bg-background px-3 py-2"
                          />
                        </label>
                      ),
                    )}

                    <button className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                      Save and connect
                    </button>
                  </form>
                ) : null}

                {isConnected && manageable ? (
                  <div className="flex flex-wrap gap-2">
                    {card.provider ===
                    'gmail' ? (
                      <form
                        action={
                          testGmailIntegration
                        }
                      >
                        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                          Send test email
                        </button>
                      </form>
                    ) : null}

                    {card.provider ===
                    'google-calendar' ? (
                      <form
                        action={
                          testGoogleCalendarIntegration
                        }
                      >
                        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                          Create test event
                        </button>
                      </form>
                    ) : null}

                    {[
                      'twilio',
                      'telnyx',
                      'signalwire',
                      'plivo',
                    ].includes(
                      card.provider,
                    ) ? (
                      <>
                        <form
                          action={
                            testTelephonyIntegration
                          }
                        >
                          <input
                            type="hidden"
                            name="provider"
                            value={
                              card.provider
                            }
                          />

                          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                            Test {card.name}
                          </button>
                        </form>

                        <form
                          action={
                            syncTelephonyPhoneNumbers
                          }
                        >
                          <input
                            type="hidden"
                            name="provider"
                            value={
                              card.provider
                            }
                          />

                          <button className="rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10">
                            Import {card.name}{' '}
                            numbers
                          </button>
                        </form>
                      </>
                    ) : null}

                    <form
                      action={
                        disconnectIntegration
                      }
                    >
                      <input
                        type="hidden"
                        name="provider"
                        value={card.provider}
                      />

                      <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
                        Disconnect
                      </button>
                    </form>
                  </div>
                ) : null}

                {[
                  'twilio',
                  'telnyx',
                  'signalwire',
                  'plivo',
                ].includes(card.provider) &&
                isConnected
                  ? (() => {
                      const providerNumbers =
                        phoneNumbers.filter(
                          (number) =>
                            number.provider ===
                            card.provider,
                        )

                      return (
                        <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">
                                Imported{' '}
                                {card.name} numbers
                              </p>

                              <p className="text-xs text-muted-foreground">
                                Only numbers owned
                                by this subscriber
                                account can be
                                selected.
                              </p>
                            </div>

                            <Link
                              href="/dashboard/settings/phone-numbers"
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Manage numbers
                            </Link>
                          </div>

                          {providerNumbers.length ? (
                            <div className="mt-3 grid gap-2">
                              {providerNumbers.map(
                                (number) => (
                                  <div
                                    key={
                                      number.phone_number
                                    }
                                    className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-sm">
                                          {
                                            number.phone_number
                                          }
                                        </span>

                                        {number.is_default ? (
                                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                                            Default
                                            caller ID
                                          </span>
                                        ) : null}
                                      </div>

                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {
                                          number.friendly_name
                                        }{' '}
                                        ·{' '}
                                        {Object.entries(
                                          number.capabilities ??
                                            {},
                                        )
                                          .filter(
                                            ([
                                              ,
                                              enabled,
                                            ]) =>
                                              enabled,
                                          )
                                          .map(
                                            ([
                                              capability,
                                            ]) =>
                                              capability,
                                          )
                                          .join(
                                            ', ',
                                          ) ||
                                          'No capabilities reported'}
                                      </p>
                                    </div>

                                    {!number.is_default &&
                                    manageable ? (
                                      <form
                                        action={
                                          setDefaultTelephonyPhoneNumber
                                        }
                                      >
                                        <input
                                          type="hidden"
                                          name="provider"
                                          value={
                                            card.provider
                                          }
                                        />

                                        <input
                                          type="hidden"
                                          name="phone_number"
                                          value={
                                            number.phone_number
                                          }
                                        />

                                        <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                                          Use as default
                                        </button>
                                      </form>
                                    ) : null}
                                  </div>
                                ),
                              )}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-muted-foreground">
                              No numbers imported
                              yet. Test the account,
                              then import its owned
                              numbers.
                            </p>
                          )}
                        </div>
                      )
                    })()
                  : null}
              </div>

              {item?.last_tested_at ? (
                <p
                  className={`mt-3 text-xs ${
                    item.last_test_status ===
                    'passed'
                      ? 'text-emerald-300'
                      : 'text-red-300'
                  }`}
                >
                  Last connection test:{' '}
                  {item.last_test_status ===
                  'passed'
                    ? 'Passed'
                    : 'Failed'}{' '}
                  ·{' '}
                  {new Date(
                    item.last_tested_at,
                  ).toLocaleString('en-US', { timeZone })}
                </p>
              ) : null}

              {!manageable ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Only organization owners and
                  admins can manage integrations.
                </p>
              ) : null}

              {item?.last_error ? (
                <p className="mt-3 text-xs text-red-300">
                  Last error: {item.last_error}
                </p>
              ) : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}
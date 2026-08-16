import Link from 'next/link'
import {
  Activity,
  CheckCircle2,
  CircleOff,
  Mail,
  Megaphone,
  MessageSquareText,
  PauseCircle,
  Phone,
  PlayCircle,
  RefreshCcw,
  Workflow,
} from 'lucide-react'

import {
  getAutomationSummary,
  getQueueHealth,
  getSchedulerRuns,
} from '@/lib/automation/admin'
import { getAutomationControl } from '@/lib/automation/operations'
import { requireFeature } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'

import {
  releaseExpiredCampaignReservations,
  retryAllFailedAutomationJobs,
  updateAutomationControls,
  updatePostCallAutomation,
} from './actions'

import { getCurrentOrganizationTimezone } from '@/lib/team'
type PostCallConfig = {
  enabled: boolean
  email_enabled: boolean
  sms_enabled: boolean
  trigger_statuses: string[]
  delay_seconds: number
  email_subject: string | null
  email_body: string | null
  sms_body: string | null
  ai_enabled: boolean
  ai_tone: string
  ai_instructions: string | null
}

type IntegrationRow = {
  provider: string
  enabled: boolean
  status: string
  config: Record<string, unknown> | null
}

type PhoneNumberRow = {
  provider: string
  phone_number: string
  friendly_name: string
  capabilities: Record<string, boolean> | null
  is_default: boolean
}

const DEFAULT_POST_CALL_CONFIG: PostCallConfig = {
  enabled: false,
  email_enabled: false,
  sms_enabled: false,
  trigger_statuses: ['completed'],
  delay_seconds: 0,
  email_subject: null,
  email_body: null,
  sms_body: null,
  ai_enabled: false,
  ai_tone: 'professional',
  ai_instructions: null,
}

function formatDate(value: string | null, timeZone: string) {
  if (!value) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function connectedEmailIdentity(integrations: IntegrationRow[]) {
  const gmail = integrations.find(
    (item) =>
      item.provider === 'gmail' &&
      item.enabled &&
      item.status === 'connected',
  )

  if (!gmail) {
    return null
  }

  const config = gmail.config ?? {}
  return typeof config.connected_email === 'string'
    ? config.connected_email
    : 'Connected Gmail account'
}

function smsCapable(number: PhoneNumberRow) {
  if (number.provider !== 'signalwire') return false
  const capabilities = number.capabilities ?? {}
  return capabilities.sms !== false
}

function signalWireConnected(integrations: IntegrationRow[]) {
  return integrations.some(
    (item) =>
      item.provider === 'signalwire' &&
      item.enabled &&
      item.status === 'connected',
  )
}

export default async function AutomationOperationsPage() {
  const timeZone = await getCurrentOrganizationTimezone()
  const organization = await requireFeature(
    'automation.advanced',
    'automation.view',
  )
  const supabase = await createClient()

  const [
    control,
    summary,
    queues,
    runs,
    configResult,
    integrationResult,
    phoneNumberResult,
  ] = await Promise.all([
    getAutomationControl(organization.organization_id),
    getAutomationSummary(organization.organization_id),
    getQueueHealth(organization.organization_id),
    getSchedulerRuns(organization.organization_id),
    supabase
      .from('post_call_automation_configs')
      .select(
        'enabled,email_enabled,sms_enabled,trigger_statuses,delay_seconds,email_subject,email_body,sms_body,ai_enabled,ai_tone,ai_instructions',
      )
      .eq('organization_id', organization.organization_id)
      .maybeSingle(),
    supabase
      .from('organization_integrations')
      .select('provider,enabled,status,config')
      .eq('organization_id', organization.organization_id),
    supabase
      .from('organization_phone_numbers')
      .select(
        'provider,phone_number,friendly_name,capabilities,is_default',
      )
      .eq('organization_id', organization.organization_id)
      .order('is_default', { ascending: false }),
  ])

  if (configResult.error) {
    throw new Error(
      `Unable to load post-call automation configuration: ${configResult.error.message}`,
    )
  }

  if (integrationResult.error) {
    throw new Error(
      `Unable to load email integration status: ${integrationResult.error.message}`,
    )
  }

  if (phoneNumberResult.error) {
    throw new Error(
      `Unable to load SMS sender status: ${phoneNumberResult.error.message}`,
    )
  }

  const postCallConfig =
    (configResult.data as PostCallConfig | null) ??
    DEFAULT_POST_CALL_CONFIG
  const integrations =
    (integrationResult.data ?? []) as IntegrationRow[]
  const phoneNumbers =
    (phoneNumberResult.data ?? []) as PhoneNumberRow[]

  const emailIdentity = connectedEmailIdentity(integrations)
  const smsInfrastructureConnected = signalWireConnected(integrations)
  const defaultSmsNumber =
    phoneNumbers.find(
      (number) => number.is_default && smsCapable(number),
    ) ??
    phoneNumbers.find((number) => smsCapable(number)) ??
    null

  const canManage = hasPermission(
    organization.role,
    'automation.manage',
  )
  const canManagePostCall = hasPermission(
    organization.role,
    'automation.post_call.manage',
  )

  const hasAttention = queues.some(
    (queue) => queue.failed > 0 || queue.dead_letter > 0,
  )

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium text-cyan-400">
          Automation operations
        </p>
        <h1 className="mt-1 text-3xl font-bold">
          Monitoring and Controls
        </h1>
        <p className="mt-2 text-muted-foreground">
          Configure follow-up automation, pause work safely, review
          queue health, recover reservations, and retry failed work.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 text-cyan-300">
            <Workflow className="h-5 w-5" />
            <span className="font-medium">Sequences</span>
          </div>
          <p className="mt-4 text-3xl font-bold">
            {summary.activeSequenceEnrollments}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Active enrollments across {summary.activeSequences} active
            sequences
          </p>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 text-violet-300">
            <Megaphone className="h-5 w-5" />
            <span className="font-medium">Campaigns</span>
          </div>
          <p className="mt-4 text-3xl font-bold">
            {summary.reservedCampaignMembers}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Reserved members across {summary.activeCampaigns} active
            campaigns
          </p>
        </article>

        <article
          className={`rounded-xl border bg-card p-5 ${
            hasAttention
              ? 'border-rose-500/30'
              : 'border-border'
          }`}
        >
          <div className="flex items-center gap-3 text-amber-300">
            <MessageSquareText className="h-5 w-5" />
            <span className="font-medium">Communications</span>
          </div>
          <p className="mt-4 text-3xl font-bold">
            {summary.queuedCommunications}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Queued messages; {summary.failedCommunications} failed
          </p>
        </article>

        <article
          className={`rounded-xl border bg-card p-5 ${
            summary.failedPostCallDispatches > 0
              ? 'border-rose-500/30'
              : 'border-border'
          }`}
        >
          <div className="flex items-center gap-3 text-emerald-300">
            <Phone className="h-5 w-5" />
            <span className="font-medium">Post-call follow-up</span>
          </div>
          <p className="mt-4 text-3xl font-bold">
            {summary.pendingPostCallDispatches}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pending dispatches; {summary.failedPostCallDispatches} failed
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {summary.postCallEmails} email · {summary.postCallSms} SMS created
          </p>
        </article>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div>
          <p className="text-sm font-medium text-primary">
            Post-call follow-up
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            Automatic email and SMS
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Automatically follow up with the CRM contact after a call.
            Email uses the subscriber&apos;s connected Gmail account.
            SMS uses an SMS-capable phone number connected to this
            organization.
          </p>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div
            className={`rounded-lg border p-4 ${
              emailIdentity
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-amber-500/30 bg-amber-500/5'
            }`}
          >
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">Email sender</p>
                  {emailIdentity ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <CircleOff className="h-4 w-4 text-amber-300" />
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {emailIdentity ??
                    'No subscriber Gmail account is connected.'}
                </p>
                {!emailIdentity ? (
                  <Link
                    href="/dashboard/settings/integrations"
                    className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
                  >
                    Connect email integration
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <div
            className={`rounded-lg border p-4 ${
              smsInfrastructureConnected && defaultSmsNumber
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-amber-500/30 bg-amber-500/5'
            }`}
          >
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-5 w-5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">SMS sender</p>
                  {smsInfrastructureConnected && defaultSmsNumber ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <CircleOff className="h-4 w-4 text-amber-300" />
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {smsInfrastructureConnected && defaultSmsNumber
                    ? `${defaultSmsNumber.friendly_name} · ${defaultSmsNumber.phone_number}`
                    : !smsInfrastructureConnected
                      ? 'Flowtix SMS infrastructure is not currently connected for this workspace.'
                      : 'No SMS-capable Flowtix phone number is assigned to this workspace.'}
                </p>
                {smsInfrastructureConnected && !defaultSmsNumber ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Outbound phone numbers are assigned by the Flowtix Platform team.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <form
          action={updatePostCallAutomation}
          className="mt-6 space-y-6"
        >
          <fieldset disabled={!canManagePostCall} className="space-y-6">
            <label className="flex items-center gap-3 rounded-lg border border-border bg-background p-4">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={postCallConfig.enabled}
                className="h-4 w-4"
              />
              <span>
                <span className="block text-sm font-semibold">
                  Enable post-call automation
                </span>
                <span className="block text-xs text-muted-foreground">
                  Saving a template does not send anything unless this
                  switch is enabled.
                </span>
              </span>
            </label>

            <div>
              <p className="text-sm font-semibold">Channels</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-lg border border-border bg-background p-4">
                  <input
                    type="checkbox"
                    name="emailEnabled"
                    defaultChecked={postCallConfig.email_enabled}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">
                    Email follow-up
                  </span>
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-border bg-background p-4">
                  <input
                    type="checkbox"
                    name="smsEnabled"
                    defaultChecked={postCallConfig.sms_enabled}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">
                    SMS follow-up
                  </span>
                </label>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold">
                Trigger when the call reaches
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                These are the terminal call states currently supported
                by the Flowtix call schema.
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {[
                  ['completed', 'Completed'],
                  ['failed', 'Failed'],
                  ['cancelled', 'Cancelled'],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background p-4"
                  >
                    <input
                      type="checkbox"
                      name="triggerStatuses"
                      value={value}
                      defaultChecked={postCallConfig.trigger_statuses.includes(
                        value,
                      )}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-medium">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <label className="block max-w-sm">
              <span className="text-sm font-semibold">Delay</span>
              <select
                name="delaySeconds"
                defaultValue={String(postCallConfig.delay_seconds)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2"
              >
                <option value="0">Immediately</option>
                <option value="60">1 minute</option>
                <option value="300">5 minutes</option>
                <option value="900">15 minutes</option>
                <option value="1800">30 minutes</option>
                <option value="3600">1 hour</option>
                <option value="86400">24 hours</option>
              </select>
            </label>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4 rounded-lg border border-border bg-background p-5">
                <div>
                  <p className="font-semibold">Email template</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sent to the contact&apos;s CRM email address through
                    the subscriber&apos;s connected email account.
                  </p>
                </div>
                <label className="block">
                  <span className="text-sm font-medium">Subject</span>
                  <input
                    name="emailSubject"
                    defaultValue={postCallConfig.email_subject ?? ''}
                    placeholder="Thanks for speaking with us"
                    className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Message</span>
                  <textarea
                    name="emailBody"
                    rows={8}
                    defaultValue={postCallConfig.email_body ?? ''}
                    placeholder="Hi {{contact.first_name}}, thanks for speaking with us today."
                    className="mt-2 w-full resize-y rounded-lg border border-border bg-card px-3 py-2"
                  />
                </label>
              </div>

              <div className="space-y-4 rounded-lg border border-border bg-background p-5">
                <div>
                  <p className="font-semibold">SMS template</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sent to the contact&apos;s CRM phone number using
                    the organization&apos;s SMS-capable Flowtix number.
                  </p>
                </div>
                <label className="block">
                  <span className="text-sm font-medium">Message</span>
                  <textarea
                    name="smsBody"
                    rows={8}
                    defaultValue={postCallConfig.sms_body ?? ''}
                    placeholder="Hi {{contact.first_name}}, thanks for your time today."
                    className="mt-2 w-full resize-y rounded-lg border border-border bg-card px-3 py-2"
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  SMS length and provider segmentation will be handled
                  by the existing communications delivery system.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-5">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="aiEnabled"
                  defaultChecked={postCallConfig.ai_enabled}
                  className="mt-1 h-4 w-4"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    Personalize with Flowtix AI
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Optional. AI uses the approved templates below as
                    guardrails and may use the call summary/transcript
                    when available. If AI entitlement, quota, or provider
                    execution is unavailable, Flowtix safely falls back
                    to the saved template instead of blocking follow-up.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
                <label className="block">
                  <span className="text-sm font-medium">AI tone</span>
                  <select
                    name="aiTone"
                    defaultValue={postCallConfig.ai_tone}
                    className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="concise">Concise</option>
                    <option value="persuasive">Persuasive</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium">
                    AI instructions
                  </span>
                  <textarea
                    name="aiInstructions"
                    rows={4}
                    maxLength={2000}
                    defaultValue={
                      postCallConfig.ai_instructions ?? ''
                    }
                    placeholder="Example: Thank the customer, keep the message brief, and invite them to reply with questions. Do not add pricing or promises."
                    className="mt-2 w-full resize-y rounded-lg border border-border bg-card px-3 py-2"
                  />
                </label>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                AI personalization uses Flowtix&apos;s existing AI provider,
                entitlement, reservation, usage-accounting, and organization
                isolation systems. Normal saved-template automation does not
                consume AI.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-semibold">
                Template variables
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                These variables are rendered from the verified Flowtix
                contact, caller, organization, and call records.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  '{{contact.first_name}}',
                  '{{contact.last_name}}',
                  '{{contact.company}}',
                  '{{agent.name}}',
                  '{{organization.name}}',
                  '{{call.duration}}',
                  '{{call.status}}',
                ].map((variable) => (
                  <code
                    key={variable}
                    className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                  >
                    {variable}
                  </code>
                ))}
              </div>
            </div>

            {canManagePostCall ? (
              <button className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
                Save post-call automation
              </button>
            ) : null}
          </fieldset>
        </form>

        {!canManagePostCall ? (
          <p className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            You can review this configuration, but your current role
            cannot change post-call automation settings.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          {control.global_paused ? (
            <PauseCircle className="mt-1 h-6 w-6 text-amber-300" />
          ) : (
            <PlayCircle className="mt-1 h-6 w-6 text-emerald-300" />
          )}
          <div>
            <h2 className="text-xl font-semibold">
              Automation pause controls
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Paused jobs are deferred and checked again later. They are
              not permanently failed.
            </p>
          </div>
        </div>

        <form
          action={updateAutomationControls}
          className="mt-6 space-y-5"
        >
          <fieldset disabled={!canManage} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['globalPaused', 'Pause all automation', control.global_paused],
                [
                  'communicationsPaused',
                  'Pause email and SMS',
                  control.communications_paused,
                ],
                [
                  'sequencesPaused',
                  'Pause sequences',
                  control.sequences_paused,
                ],
                [
                  'campaignsPaused',
                  'Pause campaigns',
                  control.campaigns_paused,
                ],
              ].map(([name, label, enabled]) => (
                <label
                  key={String(name)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background p-4"
                >
                  <input
                    type="checkbox"
                    name={String(name)}
                    defaultChecked={Boolean(enabled)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">
                    {String(label)}
                  </span>
                </label>
              ))}
            </div>

            <label className="block">
              <span className="text-sm font-medium">Pause reason</span>
              <input
                name="pauseReason"
                defaultValue={control.pause_reason ?? ''}
                placeholder="Optional operational note"
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>

            {canManage ? (
              <button className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
                Save automation controls
              </button>
            ) : null}
          </fieldset>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <form
          action={retryAllFailedAutomationJobs}
          className="rounded-xl border border-border bg-card p-5"
        >
          <RefreshCcw className="h-5 w-5 text-cyan-300" />
          <h2 className="mt-3 text-lg font-semibold">
            Retry failed automation jobs
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Requeue up to 100 failed or dead-letter automation jobs for
            this organization.
          </p>
          {canManage ? (
            <button className="mt-4 rounded-lg border border-border px-4 py-2 font-medium hover:bg-muted">
              Retry failed jobs
            </button>
          ) : null}
        </form>

        <form
          action={releaseExpiredCampaignReservations}
          className="rounded-xl border border-border bg-card p-5"
        >
          <Activity className="h-5 w-5 text-violet-300" />
          <h2 className="mt-3 text-lg font-semibold">
            Recover campaign reservations
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Release expired campaign member reservations and return
            eligible members to the queue.
          </p>
          {canManage ? (
            <button className="mt-4 rounded-lg border border-border px-4 py-2 font-medium hover:bg-muted">
              Recover reservations
            </button>
          ) : null}
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Queue health</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="p-4">Queue</th>
                <th className="p-4">Queued</th>
                <th className="p-4">Scheduled</th>
                <th className="p-4">Processing</th>
                <th className="p-4">Retrying</th>
                <th className="p-4">Failed</th>
                <th className="p-4">Dead letter</th>
                <th className="p-4">Oldest pending</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((queue) => (
                <tr key={queue.queue} className="border-t border-border">
                  <td className="p-4 font-mono">{queue.queue}</td>
                  <td className="p-4">{queue.queued}</td>
                  <td className="p-4">{queue.scheduled}</td>
                  <td className="p-4">{queue.processing}</td>
                  <td className="p-4">{queue.retrying}</td>
                  <td className="p-4 text-rose-300">{queue.failed}</td>
                  <td className="p-4 text-rose-300">
                    {queue.dead_letter}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {formatDate(queue.oldest_pending_at, timeZone)}
                  </td>
                </tr>
              ))}
              {queues.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-8 text-center text-muted-foreground"
                  >
                    No automation jobs have been created yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">
            Scheduler activity
          </h2>
        </div>
        <div className="divide-y divide-border">
          {runs.map((run) => (
            <article
              key={run.id}
              className="grid gap-2 p-4 md:grid-cols-[1fr_auto_auto]"
            >
              <div>
                <p className="font-medium">{run.scheduler}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(run.started_at, timeZone)}
                </p>
              </div>
              <p className="text-sm">
                Scheduled {run.scheduled_count}; skipped{' '}
                {run.skipped_count}
              </p>
              <p
                className={
                  run.status === 'failed'
                    ? 'text-sm text-rose-300'
                    : 'text-sm text-emerald-300'
                }
              >
                {run.status}
              </p>
              {run.error_message ? (
                <p className="text-sm text-rose-300 md:col-span-3">
                  {run.error_message}
                </p>
              ) : null}
            </article>
          ))}
          {runs.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Scheduler activity will appear after automated scheduling
              begins.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}

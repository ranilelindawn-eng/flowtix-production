import {
  Activity,
  Megaphone,
  MessageSquareText,
  PauseCircle,
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
import { requirePermission } from '@/lib/auth'

import {
  releaseExpiredCampaignReservations,
  retryAllFailedAutomationJobs,
  updateAutomationControls,
} from './actions'

function formatDate(value: string | null) {
  if (!value) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default async function AutomationOperationsPage() {
  const organization = await requirePermission('automation.view')

  const [control, summary, queues, runs] = await Promise.all([
    getAutomationControl(organization.organization_id),
    getAutomationSummary(organization.organization_id),
    getQueueHealth(organization.organization_id),
    getSchedulerRuns(organization.organization_id),
  ])

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
          Pause automation safely, review queue health, recover
          reservations, and retry failed work.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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

          <button className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
            Save automation controls
          </button>
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
          <button className="mt-4 rounded-lg border border-border px-4 py-2 font-medium hover:bg-muted">
            Retry failed jobs
          </button>
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
          <button className="mt-4 rounded-lg border border-border px-4 py-2 font-medium hover:bg-muted">
            Recover reservations
          </button>
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
                    {formatDate(queue.oldest_pending_at)}
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
                  {formatDate(run.started_at)}
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

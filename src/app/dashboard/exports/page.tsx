import Link from 'next/link'
import { revalidatePath } from 'next/cache'

import {
  createExport,
  createExportSchedule,
  deleteExport,
  deleteExportSchedule,
  EXPORT_RESOURCE_LABELS,
  EXPORT_RESOURCES,
  listExports,
  listExportSchedules,
  updateExportSchedule,
  type ExportFormat,
  type ExportResource,
} from '@/lib/exports'
import { getCurrentOrganizationTimezone } from '@/lib/team'
import {
  formatDateTimeInTimeZone,
  organizationLocalDateTimeToUtc,
} from '@/lib/timezone'

export const dynamic = 'force-dynamic'

const formatLabels: Record<ExportFormat, string> = {
  csv: 'CSV',
  excel: 'Excel (.xls)',
  pdf: 'PDF',
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function statusClasses(status: string): string {
  if (status === 'completed') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  }

  if (status === 'failed' || status === 'cancelled') {
    return 'border-rose-400/20 bg-rose-400/10 text-rose-200'
  }

  return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
}

async function createExportAction(formData: FormData) {
  'use server'

  await createExport({
    resource: String(formData.get('resource')) as ExportResource,
    format: String(formData.get('format')) as ExportFormat,
  })

  revalidatePath('/dashboard/exports')
}

async function createScheduleAction(formData: FormData) {
  'use server'

  const timeZone = await getCurrentOrganizationTimezone()
  const nextRunAt = organizationLocalDateTimeToUtc(
    String(formData.get('nextRunLocal') ?? ''),
    timeZone,
  )

  if (!nextRunAt) {
    throw new Error('Choose a valid first run date and time.')
  }

  await createExportSchedule({
    name: String(formData.get('name') ?? ''),
    resource: String(formData.get('resource')) as ExportResource,
    format: String(formData.get('format')) as ExportFormat,
    frequency: String(formData.get('frequency')) as
      | 'daily'
      | 'weekly'
      | 'monthly',
    timezone: timeZone,
    nextRunAt,
    isActive: true,
  })

  revalidatePath('/dashboard/exports')
}

async function toggleScheduleAction(formData: FormData) {
  'use server'

  const id = String(formData.get('id') ?? '')
  const nextState = String(formData.get('nextState')) === 'true'

  await updateExportSchedule(id, { isActive: nextState })
  revalidatePath('/dashboard/exports')
}

async function deleteScheduleAction(formData: FormData) {
  'use server'

  await deleteExportSchedule(String(formData.get('id') ?? ''))
  revalidatePath('/dashboard/exports')
}

async function deleteExportAction(formData: FormData) {
  'use server'

  await deleteExport(String(formData.get('id') ?? ''))
  revalidatePath('/dashboard/exports')
}

export default async function ExportsPage() {
  const timeZone = await getCurrentOrganizationTimezone()
  const [exports, schedules] = await Promise.all([
    listExports(),
    listExportSchedules(),
  ])

  const completedCount = exports.filter(
    (item) => item.status === 'completed',
  ).length
  const activeSchedules = schedules.filter(
    (schedule) => schedule.isActive,
  ).length
  return (
    <div className="space-y-7">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
          Reporting operations
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Data Exports
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Create owner-controlled CSV, Excel, and PDF exports through durable
          background jobs. Export files are stored privately under the workspace
          owner&apos;s account and are not exposed to team members.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-[#0D1929] p-5">
          <p className="text-sm text-slate-400">Recent exports</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {exports.length}
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#0D1929] p-5">
          <p className="text-sm text-slate-400">Completed</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {completedCount}
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#0D1929] p-5">
          <p className="text-sm text-slate-400">Active schedules</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {activeSchedules}
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#0D1929] p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Create data export
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Exports are generated asynchronously, remain isolated to this
            organization, and are accessible only to the workspace owner.
          </p>
        </div>

        <form
          action={createExportAction}
          className="mt-5 grid gap-3 lg:grid-cols-[1.3fr_0.8fr_auto]"
        >
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              Data source
            </span>
            <select
              name="resource"
              defaultValue="contacts"
              className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/40"
            >
              {EXPORT_RESOURCES.map((resource) => (
                <option key={resource} value={resource}>
                  {EXPORT_RESOURCE_LABELS[resource]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              Format
            </span>
            <select
              name="format"
              defaultValue="csv"
              className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/40"
            >
              {(
                Object.entries(formatLabels) as [
                  ExportFormat,
                  string,
                ][]
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <button className="self-end rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
            Create export
          </button>
        </form>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          Excel exports currently use the standards-based Excel XML (.xls)
          format already supported by Flowtix. PDF exports are intended for
          compact review copies; CSV/Excel are better for full data analysis.
        </p>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0D1929]">
        <div className="border-b border-white/10 px-5 py-5 sm:px-6">
          <h2 className="text-xl font-semibold text-white">
            Export history
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Track queued, processing, completed, and failed jobs and download
            completed files through short-lived signed links.
          </p>
        </div>

        {exports.length ? (
          <div className="divide-y divide-white/10">
            {exports.map((item) => {
              const requestedBy =
                item.createdByName ||
                item.createdByEmail ||
                'Workspace member'

              return (
                <article
                  key={item.id}
                  className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[1.4fr_0.8fr_0.8fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">
                        {EXPORT_RESOURCE_LABELS[item.resource]}
                      </p>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusClasses(
                          item.status,
                        )}`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      {formatLabels[item.format]} · requested by {requestedBy}
                    </p>
                    {item.errorMessage ? (
                      <p className="mt-2 text-xs text-rose-300">
                        {item.errorMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-sm">
                    <p className="text-slate-500">Created</p>
                    <p className="mt-1 text-slate-200">
                      {formatDateTimeInTimeZone(
                        item.createdAt,
                        timeZone,
                      )}
                    </p>
                  </div>

                  <div className="text-sm">
                    <p className="text-slate-500">Output</p>
                    <p className="mt-1 text-slate-200">
                      {item.rowCount.toLocaleString()} rows ·{' '}
                      {formatBytes(item.fileSizeBytes)}
                    </p>
                    {item.expiresAt ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Expires{' '}
                        {formatDateTimeInTimeZone(
                          item.expiresAt,
                          timeZone,
                        )}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 lg:justify-end">
                    {item.status === 'completed' ? (
                      <Link
                        className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
                        href={`/api/crm/exports/${item.id}/download`}
                      >
                        Download
                      </Link>
                    ) : null}

                    {item.status !== 'queued' &&
                    item.status !== 'processing' ? (
                      <form action={deleteExportAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <button className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/15">
                          Delete
                        </button>
                      </form>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="font-medium text-white">No exports yet</p>
            <p className="mt-2 text-sm text-slate-400">
              Create your first data export above. Its progress will appear
              here.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#0D1929] p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Scheduled exports
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Automatically generate recurring exports in the organization
            timezone ({timeZone}).
          </p>
        </div>

        <form
          action={createScheduleAction}
          className="mt-5 grid gap-3 xl:grid-cols-5"
        >
          <label className="space-y-2 xl:col-span-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              Schedule name
            </span>
            <input
              required
              name="name"
              placeholder="Weekly sales export"
              className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              Data source
            </span>
            <select
              name="resource"
              defaultValue="contacts"
              className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-sm text-white"
            >
              {EXPORT_RESOURCES.map((resource) => (
                <option key={resource} value={resource}>
                  {EXPORT_RESOURCE_LABELS[resource]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              Format
            </span>
            <select
              name="format"
              defaultValue="csv"
              className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-sm text-white"
            >
              {(
                Object.entries(formatLabels) as [
                  ExportFormat,
                  string,
                ][]
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              Frequency
            </span>
            <select
              name="frequency"
              defaultValue="weekly"
              className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-sm text-white"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>

          <label className="space-y-2 xl:col-span-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              First run ({timeZone})
            </span>
            <input
              required
              type="datetime-local"
              name="nextRunLocal"
              className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-sm text-white [color-scheme:dark]"
            />
          </label>

          <div className="flex items-end xl:col-span-3">
            <button className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
              Create schedule
            </button>
          </div>
        </form>

        <div className="mt-6 space-y-3">
          {schedules.length ? (
            schedules.map((schedule) => (
              <article
                key={schedule.id}
                className="grid gap-4 rounded-2xl border border-white/10 bg-[#07111F]/80 p-4 lg:grid-cols-[1.4fr_0.8fr_0.9fr_auto]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">
                      {schedule.name}
                    </p>
                    <span
                      className={
                        schedule.isActive
                          ? 'rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200'
                          : 'rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-400'
                      }
                    >
                      {schedule.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    {EXPORT_RESOURCE_LABELS[schedule.resource]} ·{' '}
                    {formatLabels[schedule.format]}
                  </p>
                </div>

                <div className="text-sm">
                  <p className="text-slate-500">Cadence</p>
                  <p className="mt-1 capitalize text-slate-200">
                    {schedule.frequency}
                  </p>
                </div>

                <div className="text-sm">
                  <p className="text-slate-500">Next run</p>
                  <p className="mt-1 text-slate-200">
                    {formatDateTimeInTimeZone(
                      schedule.nextRunAt,
                      schedule.timezone,
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 lg:justify-end">
                  <form action={toggleScheduleAction}>
                    <input type="hidden" name="id" value={schedule.id} />
                    <input
                      type="hidden"
                      name="nextState"
                      value={String(!schedule.isActive)}
                    />
                    <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">
                      {schedule.isActive ? 'Pause' : 'Resume'}
                    </button>
                  </form>

                  <form action={deleteScheduleAction}>
                    <input type="hidden" name="id" value={schedule.id} />
                    <button className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/15">
                      Delete
                    </button>
                  </form>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center">
              <p className="font-medium text-white">
                No scheduled exports
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Add a schedule when a recurring offline data copy is useful.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
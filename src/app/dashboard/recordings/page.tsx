import Link from 'next/link'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import CloudRecordingActions from '@/components/dialer/CloudRecordingActions'

import {
  getRecordings,
  RECORDINGS_PER_PAGE,
  type Recording,
} from '@/lib/recordings'

type RecordingsPageProps = {
  searchParams: Promise<{
    page?: string
    callId?: string
  }>
}

function parsePage(value: string | undefined): number {
  const page = Number(value)

  if (!Number.isInteger(page) || page < 1) {
    return 1
  }

  return page
}

function formatDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return 'Not provided'
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return [
      `${hours}h`,
      `${minutes}m`,
      `${remainingSeconds}s`,
    ].join(' ')
  }

  if (minutes > 0) {
    return [`${minutes}m`, `${remainingSeconds}s`].join(' ')
  }

  return `${remainingSeconds}s`
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) {
    return 'Unknown'
  }

  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatMimeType(mimeType: string | null): string {
  if (!mimeType) {
    return 'Unknown type'
  }

  const labels: Record<string, string> = {
    'audio/mpeg': 'MP3 audio',
    'audio/mp3': 'MP3 audio',
    'audio/wav': 'WAV audio',
    'audio/x-wav': 'WAV audio',
    'audio/webm': 'WebM audio',
    'audio/ogg': 'OGG audio',
    'audio/mp4': 'M4A audio',
    'video/webm': 'WebM video',
    'video/mp4': 'MP4 video',
  }

  return labels[mimeType] ?? mimeType
}

function getFilename(storagePath: string): string {
  const filename = storagePath.split('/').pop()

  return filename || 'Recording'
}

function shortenId(id: string): string {
  if (id.length <= 16) {
    return id
  }

  return `${id.slice(0, 8)}…${id.slice(-6)}`
}

function createPageHref(
  page: number,
  callId: string
): string {
  const params = new URLSearchParams()

  if (page > 1) {
    params.set('page', page.toString())
  }

  if (callId) {
    params.set('callId', callId)
  }

  const query = params.toString()

  return query
    ? `/dashboard/recordings?${query}`
    : '/dashboard/recordings'
}

function RecordingCard({
  recording,
}: {
  recording: Recording
}) {
  return (
    <article className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm transition hover:border-slate-700 hover:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
            >
              <path
                d="M9 18V6l10-2v12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="6"
                cy="18"
                r="3"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <circle
                cx="16"
                cy="16"
                r="3"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">
              {getFilename(recording.storage_path)}
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Uploaded {formatDate(recording.created_at)}
            </p>
          </div>
        </div>

        <Link
          href={`/dashboard/recordings/${recording.id}`}
          className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-blue-500 hover:text-white"
        >
          View
        </Link>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <dt className="text-xs text-slate-500">Duration</dt>
          <dd className="mt-1 text-sm font-medium text-slate-200">
            {formatDuration(recording.duration_seconds)}
          </dd>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <dt className="text-xs text-slate-500">File size</dt>
          <dd className="mt-1 text-sm font-medium text-slate-200">
            {formatFileSize(recording.size_bytes)}
          </dd>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <dt className="text-xs text-slate-500">File type</dt>
          <dd className="mt-1 truncate text-sm font-medium text-slate-200">
            {formatMimeType(recording.mime_type)}
          </dd>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <dt className="text-xs text-slate-500">Related call</dt>
          <dd className="mt-1 truncate font-mono text-xs font-medium text-slate-200">
            {shortenId(recording.call_id)}
          </dd>
        </div>
      </dl>
    </article>
  )
}

export default async function RecordingsPage({
  searchParams,
}: RecordingsPageProps) {
  const params = await searchParams

  const organization = await requirePermission('recordings.view')
  const supabase = await createClient()
  const { data: cloudRecordings } = await supabase
    .from('call_recordings')
    .select('id, call_id, provider, provider_recording_sid, status, duration_seconds, channels, created_at')
    .eq('organization_id', organization.organization_id)
    .order('created_at', { ascending: false })
    .limit(12)

  const page = parsePage(params.page)
  const callId = params.callId?.trim() ?? ''

  const { recordings, count } = await getRecordings({
    page,
    callId: callId || undefined,
  })

  const totalPages = Math.max(
    1,
    Math.ceil(count / RECORDINGS_PER_PAGE)
  )

  const currentPage = Math.min(page, totalPages)
  const startItem =
    count === 0
      ? 0
      : (currentPage - 1) * RECORDINGS_PER_PAGE + 1
  const endItem = Math.min(
    currentPage * RECORDINGS_PER_PAGE,
    count
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            Recordings
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Call recordings
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Review and manage the uploaded audio and video files
            associated with your organization&apos;s calls.
          </p>
        </div>

        <Link
          href="/dashboard/recordings/new"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="mr-2 h-4 w-4"
          >
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>

          Upload recording
        </Link>
      </div>

      <section className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-cyan-300">
              Provider cloud recordings
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              Automatic call capture
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Secure playback, download, transcription, and AI analysis for recordings reported by Twilio, Telnyx, SignalWire, or Plivo.
            </p>
          </div>
          <span className="text-sm text-slate-400">
            {cloudRecordings?.length ?? 0} recent
          </span>
        </div>

        {(cloudRecordings ?? []).length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {(cloudRecordings ?? []).map((recording) => {
              const provider =
                typeof recording.provider === 'string' && recording.provider
                  ? recording.provider
                  : 'twilio'
              const providerLabel =
                provider === 'signalwire'
                  ? 'SignalWire'
                  : provider.charAt(0).toUpperCase() + provider.slice(1)

              return (
                <article
                  key={recording.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-white">
                          Call {shortenId(recording.call_id)}
                        </p>
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
                          {providerLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDate(recording.created_at)} ·{' '}
                        {formatDuration(recording.duration_seconds)}
                        {recording.channels
                          ? ` · ${recording.channels} channel${recording.channels === 1 ? '' : 's'}`
                          : ''}
                      </p>
                    </div>

                    <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold capitalize text-emerald-300">
                      {recording.status}
                    </span>
                  </div>

                  <audio
                    controls
                    preload="none"
                    className="mt-4 w-full"
                    src={`/api/telephony/recordings/media?id=${recording.id}`}
                  />

                  <CloudRecordingActions
                    recordingId={recording.id}
                    callId={recording.call_id}
                  />

                  <div className="mt-3 flex justify-end">
                    <a
                      href={`/api/telephony/recordings/media?id=${recording.id}&download=1`}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                    >
                      Download recording
                    </a>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm leading-6 text-slate-400">
            Provider recordings will appear here after your connected Twilio, Telnyx, SignalWire, or Plivo account reports a completed recording.
          </p>
        )}
      </section>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <form
          action="/dashboard/recordings"
          method="get"
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="flex-1">
            <label
              htmlFor="callId"
              className="sr-only"
            >
              Filter by call ID
            </label>

            <div className="relative">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="m16.5 16.5 4 4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>

              <input
                id="callId"
                name="callId"
                type="search"
                defaultValue={callId}
                placeholder="Filter by exact call ID"
                className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-700"
          >
            Apply filter
          </button>

          {callId ? (
            <Link
              href="/dashboard/recordings"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:text-white"
            >
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      <div className="flex flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {count === 0
            ? 'No recordings found'
            : `Showing ${startItem}–${endItem} of ${count} recordings`}
        </p>

        {callId ? (
          <p className="truncate">
            Filtered by call:{' '}
            <span className="font-mono text-slate-300">
              {callId}
            </span>
          </p>
        ) : null}
      </div>

      {recordings.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recordings.map((recording) => (
            <RecordingCard
              key={recording.id}
              recording={recording}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="h-7 w-7"
            >
              <path
                d="M9 18V6l10-2v12"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="6"
                cy="18"
                r="3"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <circle
                cx="16"
                cy="16"
                r="3"
                stroke="currentColor"
                strokeWidth="1.7"
              />
            </svg>
          </div>

          <h2 className="mt-5 text-lg font-semibold text-white">
            {callId
              ? 'No matching recordings'
              : 'No recordings yet'}
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
            {callId
              ? 'No recordings are attached to that call ID. Check the ID or clear the filter.'
              : 'Upload your first call recording to make it available for review and playback.'}
          </p>

          {callId ? (
            <Link
              href="/dashboard/recordings"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 hover:text-white"
            >
              Clear filter
            </Link>
          ) : (
            <Link
              href="/dashboard/recordings/new"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Upload first recording
            </Link>
          )}
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label="Recordings pagination"
          className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-slate-400">
            Page{' '}
            <span className="font-medium text-slate-200">
              {currentPage}
            </span>{' '}
            of{' '}
            <span className="font-medium text-slate-200">
              {totalPages}
            </span>
          </p>

          <div className="flex items-center gap-2">
            {currentPage > 1 ? (
              <Link
                href={createPageHref(
                  currentPage - 1,
                  callId
                )}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:text-white"
              >
                Previous
              </Link>
            ) : (
              <span className="inline-flex min-h-10 cursor-not-allowed items-center justify-center rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-2 text-sm font-semibold text-slate-600">
                Previous
              </span>
            )}

            {currentPage < totalPages ? (
              <Link
                href={createPageHref(
                  currentPage + 1,
                  callId
                )}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:text-white"
              >
                Next
              </Link>
            ) : (
              <span className="inline-flex min-h-10 cursor-not-allowed items-center justify-center rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-2 text-sm font-semibold text-slate-600">
                Next
              </span>
            )}
          </div>
        </nav>
      ) : null}
    </div>
  )
}
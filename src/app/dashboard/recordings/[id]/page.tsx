import Link from 'next/link'
import { notFound } from 'next/navigation'

import { deleteRecording } from '@/app/dashboard/recordings/actions'
import { requirePermission } from '@/lib/auth'
import {
  getRecording,
  getRecordingSignedUrl,
} from '@/lib/recordings'

type RecordingDetailPageProps = {
  params: Promise<{
    id: string
  }>
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
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
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
    return 'Unknown'
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
  return storagePath.split('/').pop() || 'Recording'
}

function isVideoRecording(mimeType: string | null): boolean {
  return mimeType?.startsWith('video/') ?? false
}

export default async function RecordingDetailPage({
  params,
}: RecordingDetailPageProps) {
  const { id } = await params

  await requirePermission('recordings.view')

  const recording = await getRecording(id)

  if (!recording) {
    notFound()
  }

  const signedUrl = await getRecordingSignedUrl(recording)
  const filename = getFilename(recording.storage_path)
  const isVideo = isVideoRecording(recording.mime_type)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-blue-400">
            Recordings
          </p>

          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {filename}
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Review playback, file details, and the related call.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <Link
            href="/dashboard/recordings"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
          >
            Back to recordings
          </Link>

          <Link
            href={`/dashboard/calls/${recording.call_id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            View related call
          </Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-black/10">
        <div className="border-b border-slate-800 px-6 py-5">
          <h2 className="text-lg font-semibold text-white">
            Recording playback
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Secure playback access expires automatically.
          </p>
        </div>

        <div className="p-6">
          {signedUrl ? (
            isVideo ? (
              <video
                controls
                preload="metadata"
                className="w-full rounded-xl border border-slate-800 bg-black"
              >
                <source
                  src={signedUrl}
                  type={recording.mime_type ?? undefined}
                />
                Your browser does not support video playback.
              </video>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
                <audio
                  controls
                  preload="metadata"
                  className="w-full"
                >
                  <source
                    src={signedUrl}
                    type={recording.mime_type ?? undefined}
                  />
                  Your browser does not support audio playback.
                </audio>
              </div>
            )
          ) : (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4">
              <h3 className="text-sm font-semibold text-amber-200">
                Playback unavailable
              </h3>

              <p className="mt-1 text-sm leading-6 text-amber-100/70">
                A secure playback link could not be created for this
                recording. Confirm that the storage object still exists
                and that the bucket policies are configured correctly.
              </p>
            </div>
          )}

          {signedUrl ? (
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-blue-500 hover:text-white"
            >
              Open recording in new tab
            </a>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70">
          <div className="border-b border-slate-800 px-6 py-5">
            <h2 className="text-lg font-semibold text-white">
              Recording details
            </h2>
          </div>

          <dl className="grid gap-px bg-slate-800 sm:grid-cols-2">
            <div className="bg-slate-900 px-6 py-5">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Filename
              </dt>
              <dd className="mt-2 break-all text-sm font-medium text-slate-200">
                {filename}
              </dd>
            </div>

            <div className="bg-slate-900 px-6 py-5">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                File type
              </dt>
              <dd className="mt-2 text-sm font-medium text-slate-200">
                {formatMimeType(recording.mime_type)}
              </dd>
            </div>

            <div className="bg-slate-900 px-6 py-5">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Duration
              </dt>
              <dd className="mt-2 text-sm font-medium text-slate-200">
                {formatDuration(recording.duration_seconds)}
              </dd>
            </div>

            <div className="bg-slate-900 px-6 py-5">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                File size
              </dt>
              <dd className="mt-2 text-sm font-medium text-slate-200">
                {formatFileSize(recording.size_bytes)}
              </dd>
            </div>

            <div className="bg-slate-900 px-6 py-5">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Uploaded
              </dt>
              <dd className="mt-2 text-sm font-medium text-slate-200">
                {formatDate(recording.created_at)}
              </dd>
            </div>

            <div className="bg-slate-900 px-6 py-5">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Last updated
              </dt>
              <dd className="mt-2 text-sm font-medium text-slate-200">
                {formatDate(recording.updated_at)}
              </dd>
            </div>

            <div className="bg-slate-900 px-6 py-5 sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Related call ID
              </dt>
              <dd className="mt-2 break-all font-mono text-sm text-slate-200">
                {recording.call_id}
              </dd>
            </div>

            <div className="bg-slate-900 px-6 py-5 sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Storage path
              </dt>
              <dd className="mt-2 break-all font-mono text-xs leading-6 text-slate-300">
                {recording.storage_path}
              </dd>
            </div>
          </dl>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-sm font-semibold text-white">
              Storage information
            </h2>

            <dl className="mt-4 space-y-4">
              <div>
                <dt className="text-xs text-slate-500">
                  Bucket
                </dt>
                <dd className="mt-1 break-all font-mono text-sm text-slate-200">
                  {recording.bucket_name}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-slate-500">
                  Recording ID
                </dt>
                <dd className="mt-1 break-all font-mono text-xs leading-5 text-slate-200">
                  {recording.id}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
            <h2 className="text-sm font-semibold text-red-200">
              Delete recording
            </h2>

            <p className="mt-2 text-sm leading-6 text-red-100/60">
              This permanently removes the uploaded storage object and
              its database record. This action cannot be undone.
            </p>

            <form action={deleteRecording} className="mt-5">
              <input
                type="hidden"
                name="id"
                value={recording.id}
              />

              <button
                type="submit"
                className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:border-red-400/50 hover:bg-red-500/20"
              >
                Delete recording
              </button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  )
}
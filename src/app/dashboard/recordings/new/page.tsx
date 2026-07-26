import Link from 'next/link'

import { requirePermission } from '@/lib/auth'
import RecordingUploadForm from '@/components/recordings/RecordingUploadForm'
import { getRecordingCalls } from '@/lib/recordings'

export default async function NewRecordingPage() {
  await requirePermission('recordings.create')

  const calls = await getRecordingCalls()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            Recordings
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Upload recording
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Attach an audio or video recording to an existing call in
            your organization.
          </p>
        </div>

        <Link
          href="/dashboard/recordings"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
        >
          Back to recordings
        </Link>
      </div>

      {!calls.length ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-amber-200">
            No calls are available
          </h2>

          <p className="mt-1 text-sm leading-6 text-amber-100/70">
            A recording must be attached to an existing call. Create a
            call first, then return here to upload the recording.
          </p>

          <Link
            href="/dashboard/calls/new"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Create a call
          </Link>
        </div>
      ) : null}

      <RecordingUploadForm calls={calls} />
    </div>
  )
}
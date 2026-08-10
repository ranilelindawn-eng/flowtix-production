'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { uploadRecording } from '@/app/dashboard/recordings/actions'
import type { RecordingCallOption } from '@/lib/recordings'

import { useOrganizationTimezone } from '@/components/timezone/OrganizationTimezoneProvider'
type RecordingUploadFormProps = {
  calls: RecordingCallOption[]
}

type FormErrors = {
  callId?: string
  file?: string
  duration?: string
}

const acceptedFileTypes = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'video/webm',
  'video/mp4',
]

const acceptedFileExtensions =
  '.mp3,.wav,.webm,.ogg,.m4a,.mp4'

function formatCallDate(date: string, timeZone: string): string {
  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate)
}

function formatDirection(
  direction: RecordingCallOption['direction']
): string {
  return direction === 'inbound' ? 'Inbound' : 'Outbound'
}

function formatStatus(
  status: RecordingCallOption['status']
): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function SubmitButton({
  disabled,
}: {
  disabled: boolean
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="mr-2 h-4 w-4 animate-spin"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="3"
              className="opacity-25"
            />
            <path
              d="M21 12a9 9 0 0 0-9-9"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              className="opacity-90"
            />
          </svg>

          Uploading recording...
        </>
      ) : (
        'Upload recording'
      )}
    </button>
  )
}

export default function RecordingUploadForm({
  calls,
}: RecordingUploadFormProps) {
  const timeZone = useOrganizationTimezone()
  const [selectedCallId, setSelectedCallId] = useState('')
  const [selectedFile, setSelectedFile] =
    useState<File | null>(null)
  const [duration, setDuration] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})

  const hasCalls = calls.length > 0

  const selectedCall = useMemo(
    () => calls.find((call) => call.id === selectedCallId),
    [calls, selectedCallId]
  )

  function validateForm(): boolean {
    const nextErrors: FormErrors = {}

    if (!selectedCallId) {
      nextErrors.callId = 'Select the call for this recording.'
    }

    if (!selectedFile || selectedFile.size === 0) {
      nextErrors.file = 'Select a valid recording file.'
    } else {
      const filename = selectedFile.name.toLowerCase()
      const hasAllowedExtension = [
        '.mp3',
        '.wav',
        '.webm',
        '.ogg',
        '.m4a',
        '.mp4',
      ].some((extension) => filename.endsWith(extension))

      const hasAllowedMimeType =
        !selectedFile.type ||
        acceptedFileTypes.includes(selectedFile.type)

      if (!hasAllowedExtension && !hasAllowedMimeType) {
        nextErrors.file =
          'Use an MP3, WAV, WebM, OGG, M4A, or MP4 recording.'
      }
    }

    if (duration.trim()) {
      const parsedDuration = Number(duration)

      if (
        !Number.isInteger(parsedDuration) ||
        parsedDuration < 0
      ) {
        nextErrors.duration =
          'Duration must be a whole number of seconds.'
      }
    }

    setErrors(nextErrors)

    return Object.keys(nextErrors).length === 0
  }

  return (
    <form
      action={uploadRecording}
      onSubmit={(event) => {
        if (!validateForm()) {
          event.preventDefault()
        }
      }}
      className="space-y-6"
    >
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-black/10">
        <div className="border-b border-slate-800 px-6 py-5">
          <h2 className="text-lg font-semibold text-white">
            Recording information
          </h2>

          <p className="mt-1 text-sm leading-6 text-slate-400">
            Attach an audio recording to an existing Flowtix call.
          </p>
        </div>

        <div className="space-y-6 p-6">
          <div>
            <label
              htmlFor="call_id"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Related call
              <span className="ml-1 text-red-400">*</span>
            </label>

            <select
              id="call_id"
              name="call_id"
              value={selectedCallId}
              disabled={!hasCalls}
              required
              onChange={(event) => {
                setSelectedCallId(event.target.value)

                if (errors.callId) {
                  setErrors((current) => ({
                    ...current,
                    callId: undefined,
                  }))
                }
              }}
              aria-invalid={Boolean(errors.callId)}
              aria-describedby={
                errors.callId ? 'call-id-error' : undefined
              }
              className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {hasCalls
                  ? 'Select a call'
                  : 'No calls are available'}
              </option>

              {calls.map((call) => (
                <option key={call.id} value={call.id}>
                  {formatDirection(call.direction)} ·{' '}
                  {formatStatus(call.status)} ·{' '}
                  {formatCallDate(call.started_at, timeZone)}
                </option>
              ))}
            </select>

            {errors.callId ? (
              <p
                id="call-id-error"
                className="mt-2 text-sm text-red-400"
              >
                {errors.callId}
              </p>
            ) : null}

            {!hasCalls ? (
              <p className="mt-2 text-sm text-amber-300">
                Create a call before uploading a recording.
              </p>
            ) : null}

            {selectedCall ? (
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <span className="text-slate-400">
                    Direction:{' '}
                    <strong className="font-medium text-slate-200">
                      {formatDirection(selectedCall.direction)}
                    </strong>
                  </span>

                  <span className="text-slate-400">
                    Status:{' '}
                    <strong className="font-medium text-slate-200">
                      {formatStatus(selectedCall.status)}
                    </strong>
                  </span>

                  <span className="text-slate-400">
                    Started:{' '}
                    <strong className="font-medium text-slate-200">
                      {formatCallDate(selectedCall.started_at, timeZone)}
                    </strong>
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="file"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Recording file
              <span className="ml-1 text-red-400">*</span>
            </label>

            <label
              htmlFor="file"
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-6 py-10 text-center transition hover:border-blue-500 hover:bg-blue-500/5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-6 w-6"
                >
                  <path
                    d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>

              <span className="mt-4 text-sm font-semibold text-white">
                Choose a recording file
              </span>

              <span className="mt-1 text-xs text-slate-400">
                MP3, WAV, WebM, OGG, M4A, or MP4
              </span>

              <input
                id="file"
                name="file"
                type="file"
                required
                accept={acceptedFileExtensions}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null

                  setSelectedFile(file)

                  if (errors.file) {
                    setErrors((current) => ({
                      ...current,
                      file: undefined,
                    }))
                  }
                }}
              />
            </label>

            {selectedFile ? (
              <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {selectedFile.name}
                  </p>

                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null)

                    const input =
                      document.getElementById('file')

                    if (input instanceof HTMLInputElement) {
                      input.value = ''
                    }
                  }}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  Remove
                </button>
              </div>
            ) : null}

            {errors.file ? (
              <p className="mt-2 text-sm text-red-400">
                {errors.file}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="duration_seconds"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Duration in seconds
            </label>

            <input
              id="duration_seconds"
              name="duration_seconds"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={duration}
              placeholder="For example: 180"
              onChange={(event) => {
                setDuration(event.target.value)

                if (errors.duration) {
                  setErrors((current) => ({
                    ...current,
                    duration: undefined,
                  }))
                }
              }}
              aria-invalid={Boolean(errors.duration)}
              aria-describedby={
                errors.duration
                  ? 'duration-error'
                  : 'duration-description'
              }
              className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />

            {errors.duration ? (
              <p
                id="duration-error"
                className="mt-2 text-sm text-red-400"
              >
                {errors.duration}
              </p>
            ) : (
              <p
                id="duration-description"
                className="mt-2 text-xs text-slate-500"
              >
                Optional. Enter the full recording length as a whole
                number.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
       <Link
  href="/dashboard/recordings"
  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
>
  Cancel
</Link>

        <SubmitButton disabled={!hasCalls} />
      </div>
    </form>
  )
}
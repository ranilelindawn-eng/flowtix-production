'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'

import {
  createTranscript,
  updateTranscript,
} from '@/app/dashboard/transcripts/actions'
import type {
  Transcript,
  TranscriptRecordingOption,
} from '@/lib/transcripts'

import { useOrganizationTimezone } from '@/components/timezone/OrganizationTimezoneProvider'
type TranscriptFormProps = {
  recordings: TranscriptRecordingOption[]
  transcript?: Transcript
}

type FormErrors = {
  recordingId?: string
  language?: string
  provider?: string
  content?: string
}

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'en-US', label: 'English — United States' },
  { value: 'en-GB', label: 'English — United Kingdom' },
  { value: 'fil', label: 'Filipino' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
]

const providerOptions = [
  'Manual',
  'OpenAI Whisper',
  'Deepgram',
  'AssemblyAI',
  'Google Speech-to-Text',
  'Amazon Transcribe',
  'Azure Speech',
  'Other',
]

function formatDate(value: string, timeZone: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return 'Unknown duration'
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

function getFilename(storagePath: string): string {
  return storagePath.split('/').pop() || 'Recording'
}

function SubmitButton({
  isEditing,
  disabled,
}: {
  isEditing: boolean
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
            fill="none"
            className="mr-2 h-4 w-4 animate-spin"
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

          {isEditing
            ? 'Saving transcript...'
            : 'Creating transcript...'}
        </>
      ) : isEditing ? (
        'Save changes'
      ) : (
        'Create transcript'
      )}
    </button>
  )
}

export default function TranscriptForm({
  recordings,
  transcript,
}: TranscriptFormProps) {
  const timeZone = useOrganizationTimezone()
  const isEditing = Boolean(transcript)

  const [recordingId, setRecordingId] = useState(
    transcript?.recording_id ?? ''
  )
  const [language, setLanguage] = useState(
    transcript?.language ?? 'en'
  )
  const [provider, setProvider] = useState(
    transcript?.provider ?? 'Manual'
  )
  const [content, setContent] = useState(
    transcript?.content ?? ''
  )
  const [errors, setErrors] = useState<FormErrors>({})

  const selectedRecording = useMemo(
    () =>
      recordings.find(
        (recording) => recording.id === recordingId
      ),
    [recordings, recordingId]
  )

  const hasRecordings = recordings.length > 0
  const wordCount = content.trim()
    ? content.trim().split(/\s+/).length
    : 0
  const characterCount = content.length

  function clearError(field: keyof FormErrors) {
    setErrors((current) => ({
      ...current,
      [field]: undefined,
    }))
  }

  function validateForm(): boolean {
    const nextErrors: FormErrors = {}

    if (!recordingId) {
      nextErrors.recordingId =
        'Select the recording associated with this transcript.'
    }

    if (!language.trim()) {
      nextErrors.language = 'Language is required.'
    } else if (language.trim().length > 50) {
      nextErrors.language =
        'Language must be 50 characters or fewer.'
    }

    if (!provider.trim()) {
      nextErrors.provider = 'Provider is required.'
    } else if (provider.trim().length > 100) {
      nextErrors.provider =
        'Provider must be 100 characters or fewer.'
    }

    if (!content.trim()) {
      nextErrors.content = 'Transcript content is required.'
    } else if (content.trim().length > 1_000_000) {
      nextErrors.content =
        'Transcript content is too large.'
    }

    setErrors(nextErrors)

    return Object.keys(nextErrors).length === 0
  }

  const action = isEditing
    ? updateTranscript
    : createTranscript

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!validateForm()) {
          event.preventDefault()
        }
      }}
      className="space-y-6"
    >
      {transcript ? (
        <input
          type="hidden"
          name="id"
          value={transcript.id}
        />
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-black/10">
        <div className="border-b border-slate-800 px-6 py-5">
          <h2 className="text-lg font-semibold text-white">
            Transcript information
          </h2>

          <p className="mt-1 text-sm leading-6 text-slate-400">
            Connect the transcript to a recording and identify its
            language and transcription provider.
          </p>
        </div>

        <div className="space-y-6 p-6">
          <div>
            <label
              htmlFor="recording_id"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Recording
              <span className="ml-1 text-red-400">*</span>
            </label>

            <select
              id="recording_id"
              name="recording_id"
              value={recordingId}
              required
              disabled={!hasRecordings}
              onChange={(event) => {
                setRecordingId(event.target.value)

                if (errors.recordingId) {
                  clearError('recordingId')
                }
              }}
              aria-invalid={Boolean(errors.recordingId)}
              aria-describedby={
                errors.recordingId
                  ? 'recording-id-error'
                  : undefined
              }
              className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {hasRecordings
                  ? 'Select a recording'
                  : 'No recordings are available'}
              </option>

              {recordings.map((recording) => (
                <option
                  key={recording.id}
                  value={recording.id}
                >
                  {getFilename(recording.storage_path)} ·{' '}
                  {formatDuration(recording.duration_seconds)} ·{' '}
                  {formatDate(recording.created_at, timeZone)}
                </option>
              ))}
            </select>

            {errors.recordingId ? (
              <p
                id="recording-id-error"
                className="mt-2 text-sm text-red-400"
              >
                {errors.recordingId}
              </p>
            ) : null}

            {!hasRecordings ? (
              <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                <p className="text-sm text-amber-200">
                  Upload a recording before creating a transcript.
                </p>

                <Link
                  href="/dashboard/recordings/new"
                  className="mt-3 inline-flex min-h-9 items-center justify-center rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-200"
                >
                  Upload recording
                </Link>
              </div>
            ) : null}

            {selectedRecording ? (
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
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
                    <p className="truncate text-sm font-semibold text-white">
                      {getFilename(
                        selectedRecording.storage_path
                      )}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
                      <span>
                        Duration:{' '}
                        <strong className="font-medium text-slate-200">
                          {formatDuration(
                            selectedRecording.duration_seconds
                          )}
                        </strong>
                      </span>

                      <span>
                        Type:{' '}
                        <strong className="font-medium text-slate-200">
                          {selectedRecording.mime_type ??
                            'Unknown'}
                        </strong>
                      </span>

                      <span>
                        Uploaded:{' '}
                        <strong className="font-medium text-slate-200">
                          {formatDate(
                            selectedRecording.created_at, timeZone)}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label
                htmlFor="language"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Language
                <span className="ml-1 text-red-400">*</span>
              </label>

              <select
                id="language"
                name="language"
                value={language}
                required
                onChange={(event) => {
                  setLanguage(event.target.value)

                  if (errors.language) {
                    clearError('language')
                  }
                }}
                aria-invalid={Boolean(errors.language)}
                aria-describedby={
                  errors.language
                    ? 'language-error'
                    : undefined
                }
                className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {languageOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>

              {errors.language ? (
                <p
                  id="language-error"
                  className="mt-2 text-sm text-red-400"
                >
                  {errors.language}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="provider"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Provider
                <span className="ml-1 text-red-400">*</span>
              </label>

              <select
                id="provider"
                name="provider"
                value={provider}
                required
                onChange={(event) => {
                  setProvider(event.target.value)

                  if (errors.provider) {
                    clearError('provider')
                  }
                }}
                aria-invalid={Boolean(errors.provider)}
                aria-describedby={
                  errors.provider
                    ? 'provider-error'
                    : undefined
                }
                className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {providerOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              {errors.provider ? (
                <p
                  id="provider-error"
                  className="mt-2 text-sm text-red-400"
                >
                  {errors.provider}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Transcript content
            </h2>

            <p className="mt-1 text-sm leading-6 text-slate-400">
              Enter or paste the complete transcription for this
              recording.
            </p>
          </div>

          <div className="flex gap-3 text-xs text-slate-500">
            <span>
              {wordCount.toLocaleString()} words
            </span>

            <span>
              {characterCount.toLocaleString()} characters
            </span>
          </div>
        </div>

        <div className="p-6">
          <label htmlFor="content" className="sr-only">
            Transcript content
          </label>

          <textarea
            id="content"
            name="content"
            value={content}
            required
            rows={20}
            placeholder="Paste or type the transcript here..."
            onChange={(event) => {
              setContent(event.target.value)

              if (errors.content) {
                clearError('content')
              }
            }}
            aria-invalid={Boolean(errors.content)}
            aria-describedby={
              errors.content
                ? 'content-error'
                : 'content-description'
            }
            className="min-h-[420px] w-full resize-y rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4 font-mono text-sm leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />

          {errors.content ? (
            <p
              id="content-error"
              className="mt-2 text-sm text-red-400"
            >
              {errors.content}
            </p>
          ) : (
            <p
              id="content-description"
              className="mt-2 text-xs text-slate-500"
            >
              Include speaker labels, timestamps, or paragraph breaks
              when available.
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Link
          href={
            transcript
              ? `/dashboard/transcripts/${transcript.id}`
              : '/dashboard/transcripts'
          }
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
        >
          Cancel
        </Link>

        <SubmitButton
          isEditing={isEditing}
          disabled={!hasRecordings}
        />
      </div>
    </form>
  )
}
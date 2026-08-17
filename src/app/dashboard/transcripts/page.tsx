import Link from 'next/link'

import { requireFeature } from '@/lib/auth'

import {
  getTranscripts,
  TRANSCRIPTS_PER_PAGE,
  type Transcript,
} from '@/lib/transcripts'

import { getCurrentOrganizationTimezone } from '@/lib/team'
type TranscriptsPageProps = {
  searchParams: Promise<{
    page?: string
    search?: string
    recordingId?: string
  }>
}

function parsePage(value: string | undefined): number {
  const page = Number(value)

  if (!Number.isInteger(page) || page < 1) {
    return 1
  }

  return page
}

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

function getLanguageLabel(language: string): string {
  const labels: Record<string, string> = {
    en: 'English',
    'en-US': 'English — United States',
    'en-GB': 'English — United Kingdom',
    fil: 'Filipino',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
  }

  return labels[language] ?? language
}

function shortenId(id: string): string {
  if (id.length <= 16) {
    return id
  }

  return `${id.slice(0, 8)}…${id.slice(-6)}`
}

function getWordCount(content: string): number {
  const normalized = content.trim()

  if (!normalized) {
    return 0
  }

  return normalized.split(/\s+/).length
}

function getPreview(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()

  if (normalized.length <= 180) {
    return normalized
  }

  return `${normalized.slice(0, 177)}...`
}

function createPageHref(
  page: number,
  search: string,
  recordingId: string
): string {
  const params = new URLSearchParams()

  if (page > 1) {
    params.set('page', page.toString())
  }

  if (search) {
    params.set('search', search)
  }

  if (recordingId) {
    params.set('recordingId', recordingId)
  }

  const query = params.toString()

  return query
    ? `/dashboard/transcripts?${query}`
    : '/dashboard/transcripts'
}

function TranscriptCard({
  transcript,
  timeZone,
}: {
  transcript: Transcript
  timeZone: string
}) {
  const wordCount = getWordCount(transcript.content)

  return (
    <article className="group flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm transition hover:border-slate-700 hover:bg-slate-900">
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
                d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />

              <path
                d="M8.5 8h7M8.5 12h7M8.5 16h4.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">
              {getLanguageLabel(transcript.language)} transcript
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Created {formatDate(transcript.created_at, timeZone)}
            </p>
          </div>
        </div>

        <Link
          href={`/dashboard/transcripts/${transcript.id}`}
          className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-blue-500 hover:text-white"
        >
          View
        </Link>
      </div>

      <p className="mt-5 flex-1 text-sm leading-6 text-slate-400">
        {getPreview(transcript.content)}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <dt className="text-xs text-slate-500">Language</dt>

          <dd className="mt-1 truncate text-sm font-medium text-slate-200">
            {getLanguageLabel(transcript.language)}
          </dd>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <dt className="text-xs text-slate-500">Provider</dt>

          <dd className="mt-1 truncate text-sm font-medium text-slate-200">
            {transcript.provider}
          </dd>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <dt className="text-xs text-slate-500">Words</dt>

          <dd className="mt-1 text-sm font-medium text-slate-200">
            {wordCount.toLocaleString()}
          </dd>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <dt className="text-xs text-slate-500">
            Recording
          </dt>

          <dd className="mt-1 truncate font-mono text-xs font-medium text-slate-200">
            {shortenId(transcript.recording_id)}
          </dd>
        </div>
      </dl>
    </article>
  )
}

export default async function TranscriptsPage({
  searchParams,
}: TranscriptsPageProps) {
  await requireFeature('ai.transcription', 'transcripts.view')

  const timeZone = await getCurrentOrganizationTimezone()
  const params = await searchParams

  const page = parsePage(params.page)
  const search = params.search?.trim() ?? ''
  const recordingId = params.recordingId?.trim() ?? ''

  const { transcripts, count } = await getTranscripts({
    page,
    search: search || undefined,
    recordingId: recordingId || undefined,
  })

  const totalPages = Math.max(
    1,
    Math.ceil(count / TRANSCRIPTS_PER_PAGE)
  )

  const currentPage = Math.min(page, totalPages)

  const startItem =
    count === 0
      ? 0
      : (currentPage - 1) * TRANSCRIPTS_PER_PAGE + 1

  const endItem = Math.min(
    currentPage * TRANSCRIPTS_PER_PAGE,
    count
  )

  const hasFilters = Boolean(search || recordingId)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            Transcripts
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Call transcripts
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Review, search, and manage transcripts connected to your
            organization&apos;s call recordings.
          </p>
        </div>

        <Link
          href="/dashboard/transcripts/new"
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

          Create transcript
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <form
          action="/dashboard/transcripts"
          method="get"
          className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)_auto_auto]"
        >
          <div>
            <label htmlFor="search" className="sr-only">
              Search transcripts
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
                id="search"
                name="search"
                type="search"
                defaultValue={search}
                placeholder="Search content, language, or provider"
                className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="recordingId"
              className="sr-only"
            >
              Filter by recording ID
            </label>

            <input
              id="recordingId"
              name="recordingId"
              type="search"
              defaultValue={recordingId}
              placeholder="Exact recording ID"
              className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-white outline-none transition placeholder:font-sans placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-700"
          >
            Apply filters
          </button>

          {hasFilters ? (
            <Link
              href="/dashboard/transcripts"
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
            ? 'No transcripts found'
            : `Showing ${startItem}–${endItem} of ${count} transcripts`}
        </p>

        {recordingId ? (
          <p className="truncate">
            Recording:{' '}
            <span className="font-mono text-slate-300">
              {recordingId}
            </span>
          </p>
        ) : null}
      </div>

      {transcripts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {transcripts.map((transcript) => (
            <TranscriptCard
              key={transcript.id}
              transcript={transcript}
              timeZone={timeZone}
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
                d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
                stroke="currentColor"
                strokeWidth="1.7"
              />

              <path
                d="M8.5 8h7M8.5 12h7M8.5 16h4.5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <h2 className="mt-5 text-lg font-semibold text-white">
            {hasFilters
              ? 'No matching transcripts'
              : 'No transcripts yet'}
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
            {hasFilters
              ? 'No transcripts match the current search or recording filter. Try changing or clearing the filters.'
              : 'Create your first transcript after uploading a call recording.'}
          </p>

          {hasFilters ? (
            <Link
              href="/dashboard/transcripts"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 hover:text-white"
            >
              Clear filters
            </Link>
          ) : (
            <Link
              href="/dashboard/transcripts/new"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Create first transcript
            </Link>
          )}
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label="Transcripts pagination"
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
                  search,
                  recordingId
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
                  search,
                  recordingId
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
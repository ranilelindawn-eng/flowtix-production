import Link from 'next/link'

import { requirePermission } from '@/lib/auth'

import {
  getSummaries,
  SUMMARIES_PER_PAGE,
  type Summary,
} from '@/lib/summaries'

type SummariesPageProps = {
  searchParams: Promise<{
    page?: string
    search?: string
    sentiment?: string
    transcriptId?: string
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

function getPreview(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()

  if (!normalized) {
    return 'No summary content is available.'
  }

  if (normalized.length <= 180) {
    return normalized
  }

  return `${normalized.slice(0, 177)}...`
}

function getSentimentClasses(
  sentiment: string | null,
): string {
  switch (sentiment?.toLowerCase()) {
    case 'positive':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'

    case 'negative':
      return 'border-red-500/20 bg-red-500/10 text-red-300'

    case 'mixed':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-300'

    case 'neutral':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-300'

    default:
      return 'border-slate-600 bg-slate-700/60 text-slate-300'
  }
}

function getSentimentLabel(
  sentiment: string | null,
): string {
  const normalized = sentiment?.trim()

  if (!normalized) {
    return 'Not analyzed'
  }

  return normalized
}

function shortenId(id: string): string {
  if (id.length <= 18) {
    return id
  }

  return `${id.slice(0, 9)}…${id.slice(-7)}`
}

function createPageHref(
  page: number,
  search: string,
  sentiment: string,
  transcriptId: string,
): string {
  const params = new URLSearchParams()

  if (page > 1) {
    params.set('page', page.toString())
  }

  if (search) {
    params.set('search', search)
  }

  if (sentiment) {
    params.set('sentiment', sentiment)
  }

  if (transcriptId) {
    params.set('transcriptId', transcriptId)
  }

  const query = params.toString()

  return query
    ? `/dashboard/summaries?${query}`
    : '/dashboard/summaries'
}

function SummaryCard({
  summary,
}: {
  summary: Summary
}) {
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm transition hover:border-slate-700 hover:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
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
                d="M8.5 8h7M8.5 12h7M8.5 16h4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />

              <path
                d="m16.5 14.5.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5.5-1.1Z"
                fill="currentColor"
              />
            </svg>
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-white">
              {summary.title?.trim() || 'Untitled summary'}
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Created {formatDate(summary.created_at)}
            </p>
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getSentimentClasses(
            summary.sentiment,
          )}`}
        >
          {getSentimentLabel(summary.sentiment)}
        </span>
      </div>

      <p className="mt-5 flex-1 text-sm leading-6 text-slate-400">
        {getPreview(summary.summary)}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <dt className="text-xs text-slate-500">
            Provider
          </dt>

          <dd className="mt-1 truncate text-sm font-medium text-slate-200">
            {summary.provider || 'Not provided'}
          </dd>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <dt className="text-xs text-slate-500">
            Transcript
          </dt>

          <dd className="mt-1 truncate font-mono text-xs font-medium text-slate-200">
            {shortenId(summary.transcript_id)}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
        <Link
          href={`/dashboard/transcripts/${summary.transcript_id}`}
          className="text-sm font-medium text-slate-400 transition hover:text-white"
        >
          View transcript
        </Link>

        <Link
          href={`/dashboard/summaries/${summary.id}`}
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm font-semibold text-slate-300 transition hover:border-blue-500 hover:text-white"
        >
          View summary
        </Link>
      </div>
    </article>
  )
}

export default async function SummariesPage({
  searchParams,
}: SummariesPageProps) {
  const params = await searchParams

await requirePermission('summaries.view')

const requestedPage = parsePage(params.page)
  const search = params.search?.trim() ?? ''
  const sentiment = params.sentiment?.trim() ?? ''
  const transcriptId = params.transcriptId?.trim() ?? ''

  const { summaries, count } = await getSummaries({
    page: requestedPage,
    search: search || undefined,
    sentiment: sentiment || undefined,
    transcriptId: transcriptId || undefined,
  })

  const totalPages = Math.max(
    1,
    Math.ceil(count / SUMMARIES_PER_PAGE),
  )

  const currentPage = Math.min(
    requestedPage,
    totalPages,
  )

  const startItem =
    count === 0
      ? 0
      : (currentPage - 1) * SUMMARIES_PER_PAGE + 1

  const endItem = Math.min(
    currentPage * SUMMARIES_PER_PAGE,
    count,
  )

  const hasFilters = Boolean(
    search || sentiment || transcriptId,
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-400">
            AI Summaries
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Call summaries
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Review AI-generated call summaries, sentiment,
            discussion highlights, and transcript connections.
          </p>
        </div>

        <Link
          href="/dashboard/summaries/new"
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

          Create summary
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <form
          action="/dashboard/summaries"
          method="get"
          className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_minmax(250px,0.65fr)_auto_auto]"
        >
          <div>
            <label
              htmlFor="search"
              className="sr-only"
            >
              Search summaries
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
                placeholder="Search title, summary, or provider"
                className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="sentiment"
              className="sr-only"
            >
              Filter by sentiment
            </label>

            <select
              id="sentiment"
              name="sentiment"
              defaultValue={sentiment}
              className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">
                All sentiments
              </option>

              <option value="positive">
                Positive
              </option>

              <option value="neutral">
                Neutral
              </option>

              <option value="mixed">
                Mixed
              </option>

              <option value="negative">
                Negative
              </option>
            </select>
          </div>

          <div>
            <label
              htmlFor="transcriptId"
              className="sr-only"
            >
              Filter by transcript ID
            </label>

            <input
              id="transcriptId"
              name="transcriptId"
              type="search"
              defaultValue={transcriptId}
              placeholder="Exact transcript ID"
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
              href="/dashboard/summaries"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:text-white"
            >
              Clear
            </Link>
          ) : null}
        </form>
      </section>

      <div className="flex flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {count === 0
            ? 'No summaries found'
            : `Showing ${startItem}–${endItem} of ${count} summaries`}
        </p>

        {transcriptId ? (
          <p className="truncate">
            Transcript:{' '}
            <span className="font-mono text-slate-300">
              {transcriptId}
            </span>
          </p>
        ) : null}
      </div>

      {summaries.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summaries.map((summary) => (
            <SummaryCard
              key={summary.id}
              summary={summary}
            />
          ))}
        </div>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-16 text-center">
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
                d="M8.5 8h7M8.5 12h7M8.5 16h4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <h2 className="mt-5 text-lg font-semibold text-white">
            {hasFilters
              ? 'No matching summaries'
              : 'No summaries yet'}
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
            {hasFilters
              ? 'No summaries match the current search, sentiment, or transcript filters. Try changing or clearing the filters.'
              : 'Create your first AI summary from an existing call transcript.'}
          </p>

          {hasFilters ? (
            <Link
              href="/dashboard/summaries"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 hover:text-white"
            >
              Clear filters
            </Link>
          ) : (
            <Link
              href="/dashboard/summaries/new"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Create first summary
            </Link>
          )}
        </section>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label="Summaries pagination"
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
                  sentiment,
                  transcriptId,
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
                  sentiment,
                  transcriptId,
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
import Link from 'next/link'

import {
  getInsights,
  INSIGHTS_PER_PAGE,
  type Insight,
} from '@/lib/insights'

import { getCurrentOrganizationTimezone } from '@/lib/team'
type InsightsPageProps = {
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

function preview(text: string | null): string {
  if (!text) {
    return 'No recommendation has been added.'
  }

  const normalized = text.replace(/\s+/g, ' ').trim()

  if (normalized.length <= 170) {
    return normalized
  }

  return `${normalized.slice(0, 167)}...`
}

function sentimentStyles(sentiment: string | null): string {
  switch (sentiment) {
    case 'positive':
      return 'border-green-500/20 bg-green-500/10 text-green-300'
    case 'negative':
      return 'border-red-500/20 bg-red-500/10 text-red-300'
    case 'mixed':
      return 'border-yellow-500/20 bg-yellow-500/10 text-yellow-300'
    case 'neutral':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-300'
    default:
      return 'border-slate-600 bg-slate-700 text-slate-200'
  }
}

function buildPageHref(
  page: number,
  params: {
    search?: string
    sentiment?: string
    transcriptId?: string
  }
): string {
  const query = new URLSearchParams()

  query.set('page', String(page))

  if (params.search) {
    query.set('search', params.search)
  }

  if (params.sentiment) {
    query.set('sentiment', params.sentiment)
  }

  if (params.transcriptId) {
    query.set('transcriptId', params.transcriptId)
  }

  return `/dashboard/insights?${query.toString()}`
}

function InsightCard({
  insight,
  timeZone,
}: {
  insight: Insight
  timeZone: string
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-blue-400">
            AI Insight
          </p>

          <h2 className="mt-1 text-lg font-semibold text-white">
            {insight.provider} analysis
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            {formatDate(insight.created_at, timeZone)}
          </p>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${sentimentStyles(
            insight.sentiment
          )}`}
        >
          {insight.sentiment || 'N/A'}
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-400">
        {preview(insight.recommendation)}
      </p>

      <dl className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <dt className="text-xs text-slate-500">
            Talk ratio
          </dt>

          <dd className="mt-1 text-sm font-semibold text-white">
            {insight.talk_ratio === null
              ? 'N/A'
              : `${insight.talk_ratio}%`}
          </dd>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <dt className="text-xs text-slate-500">
            Objections
          </dt>

          <dd className="mt-1 text-sm font-semibold text-white">
            {insight.objection_count}
          </dd>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <dt className="text-xs text-slate-500">
            Keywords
          </dt>

          <dd className="mt-1 text-sm font-semibold text-white">
            {insight.keyword_count}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex items-center justify-between">
        <span className="truncate text-xs text-slate-500">
          Transcript: {insight.transcript_id}
        </span>

        <Link
          href={`/dashboard/insights/${insight.id}`}
          className="ml-4 shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:border-blue-500 hover:text-white"
        >
          View
        </Link>
      </div>
    </article>
  )
}

export default async function InsightsPage({
  searchParams,
}: InsightsPageProps) {
  const timeZone = await getCurrentOrganizationTimezone()
  const params = await searchParams

  const page = parsePage(params.page)
  const search = params.search?.trim() ?? ''
  const sentiment = params.sentiment?.trim() ?? ''
  const transcriptId = params.transcriptId?.trim() ?? ''

  const { insights, count } = await getInsights({
    page,
    search,
    sentiment,
    transcriptId,
  })

  const totalPages = Math.max(
    1,
    Math.ceil(count / INSIGHTS_PER_PAGE)
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            AI Insights
          </p>

          <h1 className="mt-1 text-3xl font-bold text-white">
            Insights
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Review sentiment, talk ratios, objections, keywords,
            and recommendations from call analysis.
          </p>
        </div>

        <Link
          href="/dashboard/insights/new"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-500"
        >
          Create insight
        </Link>
      </div>

      <form
        action="/dashboard/insights"
        className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 md:grid-cols-[1fr_220px_auto]"
      >
        <div>
          <label
            htmlFor="search"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Search
          </label>

          <input
            id="search"
            name="search"
            type="search"
            defaultValue={search}
            placeholder="Search recommendations or providers"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div>
          <label
            htmlFor="sentiment"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Sentiment
          </label>

          <select
            id="sentiment"
            name="sentiment"
            defaultValue={sentiment}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"
          >
            <option value="">All sentiments</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-white"
          >
            Filter
          </button>

          {(search || sentiment || transcriptId) && (
            <Link
              href="/dashboard/insights"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {insights.length > 0 ? (
        <>
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {insights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                timeZone={timeZone}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-4">
              <span className="text-sm text-slate-400">
                Page {page} of {totalPages}
              </span>

              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={buildPageHref(page - 1, {
                      search,
                      sentiment,
                      transcriptId,
                    })}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
                  >
                    Previous
                  </Link>
                )}

                {page < totalPages && (
                  <Link
                    href={buildPageHref(page + 1, {
                      search,
                      sentiment,
                      transcriptId,
                    })}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-16 text-center">
          <h2 className="text-lg font-semibold text-white">
            No insights found
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            {search || sentiment || transcriptId
              ? 'Try clearing the filters or using different search terms.'
              : 'Create your first call insight from an existing transcript.'}
          </p>

          <Link
            href="/dashboard/insights/new"
            className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-500"
          >
            Create insight
          </Link>
        </div>
      )}
    </div>
  )
}
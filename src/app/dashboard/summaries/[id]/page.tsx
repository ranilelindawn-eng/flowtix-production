import Link from 'next/link'
import { notFound } from 'next/navigation'

import { deleteSummary } from '@/app/dashboard/summaries/actions'
import { requirePermission } from '@/lib/auth'
import { getSummary } from '@/lib/summaries'

type SummaryDetailPageProps = {
  params: Promise<{
    id: string
  }>
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function sentimentColor(sentiment: string | null) {
  switch (sentiment) {
    case 'positive':
      return 'bg-green-500/10 text-green-300 border-green-500/20'
    case 'negative':
      return 'bg-red-500/10 text-red-300 border-red-500/20'
    case 'mixed':
      return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
    default:
      return 'bg-slate-700 text-slate-200 border-slate-600'
  }
}

export default async function SummaryDetailPage({
  params,
}: SummaryDetailPageProps) {
  const { id } = await params

  await requirePermission('summaries.view')

  const summary = await getSummary(id)

  if (!summary) {
    notFound()
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            AI Summaries
          </p>

          <h1 className="mt-1 text-3xl font-bold text-white">
            {summary.title || 'Untitled summary'}
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Review the generated summary and related metadata.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/dashboard/summaries"
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Back
          </Link>

          <Link
            href={`/dashboard/summaries/${summary.id}/edit`}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Edit
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-white">
              Summary
            </h2>

            <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-300">
              {summary.summary}
            </div>
          </div>

          {summary.key_points && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold text-white">
                Key Points
              </h2>

              <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                {summary.key_points}
              </div>
            </div>
          )}

          {summary.action_items && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold text-white">
                Action Items
              </h2>

              <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                {summary.action_items}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">
                Summary Details
              </h2>
            </div>

            <dl className="divide-y divide-slate-800">
              <div className="px-5 py-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Provider
                </dt>

                <dd className="mt-1 text-sm text-slate-200">
                  {summary.provider}
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Sentiment
                </dt>

                <dd className="mt-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${sentimentColor(
                      summary.sentiment,
                    )}`}
                  >
                    {summary.sentiment || 'N/A'}
                  </span>
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Created
                </dt>

                <dd className="mt-1 text-sm text-slate-200">
                  {formatDate(summary.created_at)}
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Updated
                </dt>

                <dd className="mt-1 text-sm text-slate-200">
                  {formatDate(summary.updated_at)}
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Transcript
                </dt>

                <dd className="mt-2 break-all font-mono text-xs text-slate-300">
                  {summary.transcript_id}
                </dd>

                <Link
                  href={`/dashboard/transcripts/${summary.transcript_id}`}
                  className="mt-3 inline-flex rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-blue-500"
                >
                  View Transcript
                </Link>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-red-500/20 bg-red-500/5">
            <div className="border-b border-red-500/20 px-5 py-4">
              <h2 className="text-sm font-semibold text-red-200">
                Danger Zone
              </h2>
            </div>

            <div className="p-5">
              <p className="text-sm text-red-100/70">
                Deleting this summary cannot be undone.
              </p>

              <form action={deleteSummary} className="mt-4">
                <input
                  type="hidden"
                  name="id"
                  value={summary.id}
                />

                <button
                  type="submit"
                  className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/20"
                >
                  Delete Summary
                </button>
              </form>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { deleteInsight } from '@/app/dashboard/insights/actions'
import { getInsight } from '@/lib/insights'

type InsightPageProps = {
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

function sentimentClass(sentiment: string | null) {
  switch (sentiment) {
    case 'positive':
      return 'bg-green-500/10 border-green-500/20 text-green-300'
    case 'negative':
      return 'bg-red-500/10 border-red-500/20 text-red-300'
    case 'mixed':
      return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
    case 'neutral':
      return 'bg-blue-500/10 border-blue-500/20 text-blue-300'
    default:
      return 'bg-slate-700 border-slate-600 text-slate-200'
  }
}

export default async function InsightPage({
  params,
}: InsightPageProps) {
  const { id } = await params

  const insight = await getInsight(id)

  if (!insight) {
    notFound()
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
        <div>
          <p className="text-sm font-medium text-blue-400">
            AI Insights
          </p>

          <h1 className="mt-1 text-3xl font-bold text-white">
            Insight Details
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Review AI analysis for this conversation.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/dashboard/insights"
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Back
          </Link>

          <Link
            href={`/dashboard/insights/${insight.id}/edit`}
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
              Recommendation
            </h2>

            <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-300">
              {insight.recommendation || 'No recommendation provided.'}
            </div>
          </div>

        </section>

        <aside className="space-y-6">

          <div className="rounded-2xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">
                Insight Details
              </h2>
            </div>

            <dl className="divide-y divide-slate-800">

              <div className="px-5 py-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Provider
                </dt>

                <dd className="mt-1 text-sm text-slate-200">
                  {insight.provider}
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Sentiment
                </dt>

                <dd className="mt-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${sentimentClass(
                      insight.sentiment
                    )}`}
                  >
                    {insight.sentiment || 'N/A'}
                  </span>
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Talk Ratio
                </dt>

                <dd className="mt-1 text-sm text-slate-200">
                  {insight.talk_ratio ?? 'N/A'}%
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Objections
                </dt>

                <dd className="mt-1 text-sm text-slate-200">
                  {insight.objection_count}
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Keywords
                </dt>

                <dd className="mt-1 text-sm text-slate-200">
                  {insight.keyword_count}
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Created
                </dt>

                <dd className="mt-1 text-sm text-slate-200">
                  {formatDate(insight.created_at)}
                </dd>
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
                Deleting this insight cannot be undone.
              </p>

              <form action={deleteInsight} className="mt-4">
                <input
                  type="hidden"
                  name="id"
                  value={insight.id}
                />

                <button
                  type="submit"
                  className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/20"
                >
                  Delete Insight
                </button>
              </form>
            </div>
          </div>

        </aside>
      </div>
    </div>
  )
}
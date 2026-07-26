import Link from 'next/link'
import { notFound } from 'next/navigation'

import InsightForm from '@/components/insights/InsightForm'
import {
  getInsight,
  getInsightSummaries,
  getInsightTranscripts,
} from '@/lib/insights'

type EditInsightPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function EditInsightPage({
  params,
}: EditInsightPageProps) {
  const { id } = await params

  const insight = await getInsight(id)

  if (!insight) {
    notFound()
  }

  const [transcripts, summaries] = await Promise.all([
    getInsightTranscripts(),
    getInsightSummaries(),
  ])

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            AI Insights
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Edit insight
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Update the sentiment, talk ratio, objection data,
            keywords, provider, and recommendation.
          </p>
        </div>

        <Link
          href={`/dashboard/insights/${insight.id}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
        >
          Back to insight
        </Link>
      </div>

      <InsightForm
        insight={insight}
        transcripts={transcripts}
        summaries={summaries}
      />
    </div>
  )
}
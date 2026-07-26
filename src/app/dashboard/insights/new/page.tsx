import Link from 'next/link'

import InsightForm from '@/components/insights/InsightForm'
import {
  getInsightSummaries,
  getInsightTranscripts,
} from '@/lib/insights'

export default async function NewInsightPage() {
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
            Create insight
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Add sentiment, talk ratio, objection data, keyword
            counts, and recommendations for a call transcript.
          </p>
        </div>

        <Link
          href="/dashboard/insights"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
        >
          Back to insights
        </Link>
      </div>

      {transcripts.length === 0 ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-amber-200">
            No transcripts are available
          </h2>

          <p className="mt-1 text-sm leading-6 text-amber-100/70">
            An insight must be connected to an existing
            transcript. Create a transcript first, then return
            here.
          </p>

          <Link
            href="/dashboard/transcripts/new"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Create transcript
          </Link>
        </div>
      ) : null}

      <InsightForm
        transcripts={transcripts}
        summaries={summaries}
      />
    </div>
  )
}
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireFeature } from '@/lib/auth'
import SummaryForm from '@/components/summaries/SummaryForm'
import {
  getSummary,
  getSummaryTranscripts,
} from '@/lib/summaries'

type EditSummaryPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function EditSummaryPage({
  params,
}: EditSummaryPageProps) {
  await requireFeature('ai.call_analysis', 'summaries.create')
  const { id } = await params

  const [summary, transcripts] = await Promise.all([
    getSummary(id),
    getSummaryTranscripts(),
  ])

  if (!summary) {
    notFound()
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            AI Summaries
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Edit summary
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Update the summary, key points, action items,
            sentiment, and provider information.
          </p>
        </div>

        <Link
          href={`/dashboard/summaries/${summary.id}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
        >
          Back to summary
        </Link>
      </div>

      <SummaryForm
        transcripts={transcripts}
        summary={summary}
      />
    </div>
  )
}
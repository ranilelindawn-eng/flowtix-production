import Link from 'next/link'
import { notFound } from 'next/navigation'

import TranscriptForm from '@/components/transcripts/TranscriptForm'
import {
  getTranscript,
  getTranscriptRecordings,
} from '@/lib/transcripts'

type EditTranscriptPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function EditTranscriptPage({
  params,
}: EditTranscriptPageProps) {
  const { id } = await params

  const [transcript, recordings] = await Promise.all([
    getTranscript(id),
    getTranscriptRecordings(),
  ])

  if (!transcript) {
    notFound()
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            Transcripts
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Edit transcript
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Update the transcript content, language, provider, or
            linked recording.
          </p>
        </div>

        <Link
          href={`/dashboard/transcripts/${transcript.id}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
        >
          Back to transcript
        </Link>
      </div>

      <TranscriptForm
        recordings={recordings}
        transcript={transcript}
      />
    </div>
  )
}
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireFeature } from '@/lib/auth'
import { deleteTranscript } from '@/app/dashboard/transcripts/actions'
import { getTranscript } from '@/lib/transcripts'

import { getCurrentOrganizationTimezone } from '@/lib/team'
type TranscriptDetailPageProps = {
  params: Promise<{
    id: string
  }>
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

function getWordCount(content: string): number {
  const normalized = content.trim()

  if (!normalized) {
    return 0
  }

  return normalized.split(/\s+/).length
}

function formatTranscriptContent(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export default async function TranscriptDetailPage({
  params,
}: TranscriptDetailPageProps) {
  await requireFeature('ai.transcription', 'transcripts.view')

  const timeZone = await getCurrentOrganizationTimezone()
  const { id } = await params

  const transcript = await getTranscript(id)

  if (!transcript) {
    notFound()
  }

  const paragraphs = formatTranscriptContent(
    transcript.content
  )
  const wordCount = getWordCount(transcript.content)
  const characterCount = transcript.content.length

  return (
    <div className="space-y-6 lg:relative lg:left-1/2 lg:w-[calc(100vw-328px)] lg:max-w-[1800px] lg:-translate-x-1/2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            Transcripts
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {getLanguageLabel(transcript.language)} transcript
          </h1>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
            Review the complete transcript and its associated
            recording details.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/transcripts"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
          >
            Back to transcripts
          </Link>

          <Link
            href={`/dashboard/transcripts/${transcript.id}/edit`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Edit transcript
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-black/10">
          <div className="flex flex-col gap-3 border-b border-slate-800 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Transcript content
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Full transcription for the linked recording.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <span>{wordCount.toLocaleString()} words</span>
              <span>
                {characterCount.toLocaleString()} characters
              </span>
            </div>
          </div>

          <div className="min-h-[480px] p-6">
            {paragraphs.length > 0 ? (
              <div className="space-y-5">
                {paragraphs.map((paragraph, index) => (
                  <p
                    key={`${index}-${paragraph.slice(0, 24)}`}
                    className="whitespace-pre-wrap text-sm leading-7 text-slate-200"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No transcript content is available.
              </p>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">
                Transcript details
              </h2>
            </div>

            <dl className="divide-y divide-slate-800">
              <div className="px-5 py-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Language
                </dt>

                <dd className="mt-1 text-sm font-medium text-slate-200">
                  {getLanguageLabel(transcript.language)}
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Provider
                </dt>

                <dd className="mt-1 text-sm font-medium text-slate-200">
                  {transcript.provider}
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Created
                </dt>

                <dd className="mt-1 text-sm font-medium text-slate-200">
                  {formatDate(transcript.created_at, timeZone)}
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Last updated
                </dt>

                <dd className="mt-1 text-sm font-medium text-slate-200">
                  {formatDate(transcript.updated_at, timeZone)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">
                Linked recording
              </h2>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Recording ID
                </p>

                <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-300">
                  {transcript.recording_id}
                </p>
              </div>

              <Link
                href={`/dashboard/recordings/${transcript.recording_id}`}
                className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-blue-500 hover:text-white"
              >
                View recording
              </Link>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-red-500/20 bg-red-500/5">
            <div className="border-b border-red-500/20 px-5 py-4">
              <h2 className="text-sm font-semibold text-red-200">
                Danger zone
              </h2>
            </div>

            <div className="p-5">
              <p className="text-sm leading-6 text-red-100/70">
                Deleting this transcript is permanent. The linked
                recording will not be deleted.
              </p>

              <form action={deleteTranscript} className="mt-4">
                <input
                  type="hidden"
                  name="id"
                  value={transcript.id}
                />

                <button
                  type="submit"
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20"
                >
                  Delete transcript
                </button>
              </form>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
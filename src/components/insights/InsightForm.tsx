'use client'

import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { useState } from 'react'

import {
  createInsight,
  updateInsight,
} from '@/app/dashboard/insights/actions'

import type {
  Insight,
  InsightTranscriptOption,
  InsightSummaryOption,
} from '@/lib/insights'

type InsightFormProps = {
  insight?: Insight
  transcripts: InsightTranscriptOption[]
  summaries: InsightSummaryOption[]
}

const sentiments = [
  { value: '', label: 'Not specified' },
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
  { value: 'mixed', label: 'Mixed' },
]

const providers = [
  'Manual',
  'OpenAI',
  'Claude',
  'Gemini',
  'DeepSeek',
  'Other',
]

function SubmitButton({
  editing,
}: {
  editing: boolean
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
    >
      {pending
        ? editing
          ? 'Saving...'
          : 'Creating...'
        : editing
          ? 'Save changes'
          : 'Create insight'}
    </button>
  )
}

export default function InsightForm({
  insight,
  transcripts,
  summaries,
}: InsightFormProps) {
  const editing = Boolean(insight)

  const [transcriptId, setTranscriptId] = useState(
    insight?.transcript_id ?? ''
  )

  const [summaryId, setSummaryId] = useState(
    insight?.summary_id ?? ''
  )

  const [sentiment, setSentiment] = useState(
    insight?.sentiment ?? ''
  )

  const [talkRatio, setTalkRatio] = useState(
    insight?.talk_ratio?.toString() ?? ''
  )

  const [objectionCount, setObjectionCount] = useState(
    insight?.objection_count.toString() ?? '0'
  )

  const [keywordCount, setKeywordCount] = useState(
    insight?.keyword_count.toString() ?? '0'
  )

  const [recommendation, setRecommendation] =
    useState(insight?.recommendation ?? '')

  const [provider, setProvider] = useState(
    insight?.provider ?? 'Manual'
  )

  const filteredSummaries = summaries.filter(
    (summary) =>
      !transcriptId ||
      summary.transcript_id === transcriptId
  )

  const action = editing
    ? updateInsight
    : createInsight

  return (
    <form action={action} className="space-y-6">
      {editing && (
        <input
          type="hidden"
          name="id"
          value={insight!.id}
        />
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Transcript
          </label>

          <select
            required
            name="transcript_id"
            value={transcriptId}
            onChange={(e) => {
              setTranscriptId(e.target.value)
              setSummaryId('')
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="">
              Select transcript
            </option>

            {transcripts.map((transcript) => (
              <option
                key={transcript.id}
                value={transcript.id}
              >
                {transcript.language} •{' '}
                {new Date(
                  transcript.created_at
                ).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Summary
          </label>

          <select
            name="summary_id"
            value={summaryId}
            onChange={(e) =>
              setSummaryId(e.target.value)
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="">
              No summary
            </option>

            {filteredSummaries.map((summary) => (
              <option
                key={summary.id}
                value={summary.id}
              >
                {summary.title || 'Untitled summary'}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-5 md:grid-cols-2">

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Sentiment
            </label>

            <select
              name="sentiment"
              value={sentiment}
              onChange={(e) =>
                setSentiment(e.target.value)
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            >
              {sentiments.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Provider
            </label>

            <select
              name="provider"
              value={provider}
              onChange={(e) =>
                setProvider(e.target.value)
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            >
              {providers.map((provider) => (
                <option
                  key={provider}
                  value={provider}
                >
                  {provider}
                </option>
              ))}
            </select>
          </div>

        </div>

        <div className="grid gap-5 md:grid-cols-3">

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Talk Ratio (%)
            </label>

            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              name="talk_ratio"
              value={talkRatio}
              onChange={(e) =>
                setTalkRatio(e.target.value)
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Objections
            </label>

            <input
              type="number"
              min="0"
              name="objection_count"
              value={objectionCount}
              onChange={(e) =>
                setObjectionCount(e.target.value)
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Keywords
            </label>

            <input
              type="number"
              min="0"
              name="keyword_count"
              value={keywordCount}
              onChange={(e) =>
                setKeywordCount(e.target.value)
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </div>

        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Recommendation
          </label>

          <textarea
            rows={6}
            name="recommendation"
            value={recommendation}
            onChange={(e) =>
              setRecommendation(e.target.value)
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </div>

      </div>

      <div className="flex justify-end gap-3">

        <Link
          href={
            editing
              ? `/dashboard/insights/${insight!.id}`
              : '/dashboard/insights'
          }
          className="rounded-xl border border-slate-700 px-5 py-2.5 text-slate-200 hover:bg-slate-800"
        >
          Cancel
        </Link>

        <SubmitButton editing={editing} />

      </div>
    </form>
  )
}
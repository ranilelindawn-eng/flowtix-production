'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useFormStatus } from 'react-dom'

import {
  createSummary,
  updateSummary,
} from '@/app/dashboard/summaries/actions'
import type {
  Summary,
  SummaryTranscriptOption,
} from '@/lib/summaries'

type SummaryFormProps = {
  transcripts: SummaryTranscriptOption[]
  summary?: Summary
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
          : 'Create summary'}
    </button>
  )
}

export default function SummaryForm({
  transcripts,
  summary,
}: SummaryFormProps) {
  const editing = Boolean(summary)

  const [transcriptId, setTranscriptId] = useState(
    summary?.transcript_id ?? ''
  )
  const [title, setTitle] = useState(
    summary?.title ?? ''
  )
  const [summaryText, setSummaryText] = useState(
    summary?.summary ?? ''
  )
  const [keyPoints, setKeyPoints] = useState(
    summary?.key_points ?? ''
  )
  const [actionItems, setActionItems] = useState(
    summary?.action_items ?? ''
  )
  const [sentiment, setSentiment] = useState(
    summary?.sentiment ?? ''
  )
  const [provider, setProvider] = useState(
    summary?.provider ?? 'Manual'
  )

  const action = editing
    ? updateSummary
    : createSummary

  return (
    <form action={action} className="space-y-6">
      {editing && (
        <input
          type="hidden"
          name="id"
          value={summary!.id}
        />
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Transcript
          </label>

          <select
            name="transcript_id"
            value={transcriptId}
            onChange={(e) =>
              setTranscriptId(e.target.value)
            }
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="">
              Select transcript
            </option>

            {transcripts.map((t) => (
              <option key={t.id} value={t.id}>
                {t.language} •{' '}
                {new Date(
                  t.created_at
                ).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Title
          </label>

          <input
            name="title"
            value={title}
            onChange={(e) =>
              setTitle(e.target.value)
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Summary
          </label>

          <textarea
            name="summary"
            rows={8}
            required
            value={summaryText}
            onChange={(e) =>
              setSummaryText(e.target.value)
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Key Points
          </label>

          <textarea
            name="key_points"
            rows={5}
            value={keyPoints}
            onChange={(e) =>
              setKeyPoints(e.target.value)
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Action Items
          </label>

          <textarea
            name="action_items"
            rows={5}
            value={actionItems}
            onChange={(e) =>
              setActionItems(e.target.value)
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
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
              {providers.map((item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Link
          href={
            editing
              ? `/dashboard/summaries/${summary!.id}`
              : '/dashboard/summaries'
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
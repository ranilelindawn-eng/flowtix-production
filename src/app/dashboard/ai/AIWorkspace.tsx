'use client'

import { useState } from 'react'

type AnalysisRecord = {
  summary?: string
  follow_up?: string
  sentiment?: string
  sentiment_score?: number
  call_score?: number
  objections?: Array<{ objection?: string; response?: string }>
  action_items?: string[]
  keywords?: string[]
  coaching?: string[]
  next_best_action?: string
}

type EmailRecord = {
  subject?: string
  body?: string
}

type TaskRecord = {
  id?: string
  title?: string
  description?: string
  priority?: string
  due_in_days?: number
}

type ApiResponse = {
  error?: string
  analysis?: AnalysisRecord
  email?: EmailRecord
  tasks?: TaskRecord[]
}

async function post(path: string, payload: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await response.json()) as ApiResponse

  if (!response.ok) throw new Error(data.error || 'Request failed.')
  return data
}

const field =
  'w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500'
const card = 'rounded-2xl border border-slate-800 bg-slate-900 p-6'
const resultCard = 'rounded-xl border border-slate-800 bg-slate-950 p-4'

function List({ items }: { items?: string[] }) {
  if (!items?.length) return <p className="text-sm text-slate-500">None identified.</p>

  return (
    <ul className="space-y-2 text-sm text-slate-200">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2">
          <span className="text-blue-400">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function AIWorkspace() {
  const [transcript, setTranscript] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null)
  const [email, setEmail] = useState<EmailRecord | null>(null)
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [loading, setLoading] = useState<'analysis' | 'email' | 'tasks' | ''>('')
  const [error, setError] = useState('')

  async function run(kind: 'analysis' | 'email' | 'tasks', action: () => Promise<void>) {
    setLoading(kind)
    setError('')

    try {
      await action()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Request failed.')
    } finally {
      setLoading('')
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className={card}>
        <h2 className="text-xl font-semibold text-white">Call intelligence</h2>
        <p className="mt-1 text-sm text-slate-400">
          Paste a transcript to generate a summary, sentiment, score, objections, coaching, and next steps.
        </p>
        <textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          rows={10}
          maxLength={50_000}
          className={`${field} mt-4`}
          placeholder="Paste a call transcript..."
        />
        <div className="mt-2 text-right text-xs text-slate-500">
          {transcript.length.toLocaleString()} / 50,000
        </div>
        <button
          type="button"
          onClick={() =>
            void run('analysis', async () => {
              const data = await post('/api/ai/analyze', { transcript })
              setAnalysis(data.analysis ?? null)
            })
          }
          disabled={loading !== '' || transcript.trim().length < 20}
          className="mt-4 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading === 'analysis' ? 'Analyzing…' : 'Analyze call'}
        </button>

        {analysis ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className={resultCard}>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Summary</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{analysis.summary}</p>
            </div>
            <div className={resultCard}>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Call result</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-500">Sentiment</p><p className="mt-1 capitalize text-white">{analysis.sentiment || 'Neutral'}</p></div>
                <div><p className="text-slate-500">Call score</p><p className="mt-1 text-white">{analysis.call_score ?? 0}/100</p></div>
              </div>
            </div>
            <div className={resultCard}>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Next-best action</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">{analysis.next_best_action}</p>
            </div>
            <div className={resultCard}>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Follow-up message</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{analysis.follow_up}</p>
            </div>
            <div className={resultCard}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-400">Action items</p>
              <List items={analysis.action_items} />
            </div>
            <div className={resultCard}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-400">Coaching</p>
              <List items={analysis.coaching} />
            </div>
            <div className={`${resultCard} lg:col-span-2`}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-400">Objections</p>
              {analysis.objections?.length ? (
                <div className="space-y-3">
                  {analysis.objections.map((item, index) => (
                    <div key={`${item.objection}-${index}`} className="rounded-lg border border-slate-800 p-3">
                      <p className="text-sm font-medium text-white">{item.objection}</p>
                      <p className="mt-1 text-sm text-slate-400">Recommended response: {item.response}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">No objections identified.</p>}
            </div>
          </div>
        ) : null}
      </section>

      <section className={card}>
        <h2 className="text-xl font-semibold text-white">AI email generation</h2>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            void run('email', async () => {
              const data = await post('/api/ai/email', {
                recipient: form.get('recipient'),
                purpose: form.get('purpose'),
                tone: form.get('tone'),
                context: form.get('context'),
              })
              setEmail(data.email ?? null)
            })
          }}
        >
          <input name="recipient" maxLength={250} className={field} placeholder="Recipient name" />
          <input name="purpose" required maxLength={1_000} className={field} placeholder="Purpose (follow-up, proposal, check-in...)" />
          <select name="tone" className={field} defaultValue="professional">
            <option className="bg-white text-slate-950" value="professional">Professional</option>
            <option className="bg-white text-slate-950" value="friendly">Friendly</option>
            <option className="bg-white text-slate-950" value="concise">Concise</option>
            <option className="bg-white text-slate-950" value="persuasive">Persuasive</option>
          </select>
          <textarea name="context" rows={5} maxLength={20_000} className={field} placeholder="Relevant context" />
          <button disabled={loading !== ''} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">
            {loading === 'email' ? 'Generating…' : 'Generate email'}
          </button>
        </form>
        {email ? (
          <div className={`${resultCard} mt-5`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Subject</p>
            <p className="mt-2 font-medium text-white">{email.subject}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-blue-400">Body</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{email.body}</p>
          </div>
        ) : null}
      </section>

      <section className={card}>
        <h2 className="text-xl font-semibold text-white">AI task suggestions</h2>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            void run('tasks', async () => {
              const data = await post('/api/ai/tasks', { context: form.get('context') })
              setTasks(data.tasks ?? [])
            })
          }}
        >
          <textarea name="context" required rows={6} maxLength={30_000} className={field} placeholder="Paste notes, a transcript, or deal context..." />
          <button disabled={loading !== ''} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">
            {loading === 'tasks' ? 'Suggesting…' : 'Suggest tasks'}
          </button>
        </form>
        {tasks.length ? (
          <div className="mt-5 space-y-3">
            {tasks.map((task, index) => (
              <div key={task.id || `${task.title}-${index}`} className={resultCard}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{task.title}</p>
                    <p className="mt-1 text-sm text-slate-400">{task.description}</p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded-full border border-slate-700 px-2.5 py-1 capitalize text-slate-300">{task.priority}</span>
                    <span className="rounded-full border border-slate-700 px-2.5 py-1 text-slate-300">Due in {task.due_in_days ?? 1} day(s)</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}

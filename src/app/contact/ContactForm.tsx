'use client'

import { FormEvent, useState } from 'react'

import { getUserFacingErrorMessage } from '@/lib/errors/user-facing'

type SubmissionState = 'idle' | 'sending' | 'sent' | 'error'
type ContactTopic = 'General inquiry' | 'Account support' | 'Security' | 'Enterprise plan'

type ContactFormProps = {
  initialTopic?: ContactTopic
}

export default function ContactForm({ initialTopic = 'General inquiry' }: ContactFormProps) {
  const [state, setState] = useState<SubmissionState>('idle')
  const [feedback, setFeedback] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('sending')
    setFeedback('')

    const form = event.currentTarget
    const formData = new FormData(form)

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          topic: formData.get('topic'),
          message: formData.get('message'),
          website: formData.get('website'),
        }),
      })

      const result = (await response.json().catch(() => null)) as
        | { error?: string; reference?: string }
        | null

      if (!response.ok) {
        throw new Error(result?.error || 'The message could not be submitted.')
      }

      form.reset()
      setState('sent')
      setFeedback(
        result?.reference
          ? `Your message was received. Reference: ${result.reference}`
          : 'Your message was received successfully.',
      )
    } catch (error) {
      setState('error')
      setFeedback(
        getUserFacingErrorMessage(error, {
          context: 'general',
          fallbackMessage:
            'The message could not be submitted. Check your connection and try again.',
        }),
      )
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.04] p-8"
    >
      <label className="grid gap-2">
        <span>Name</span>
        <input
          required
          autoComplete="name"
          minLength={2}
          maxLength={120}
          name="name"
          className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3"
        />
      </label>

      <label className="grid gap-2">
        <span>Email</span>
        <input
          required
          autoComplete="email"
          type="email"
          maxLength={254}
          name="email"
          className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3"
        />
      </label>

      <label className="grid gap-2">
        <span>Topic</span>
        <select
          name="topic"
          defaultValue={initialTopic}
          className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3"
        >
          <option value="General inquiry">General inquiry</option>
          <option value="Account support">Account support</option>
          <option value="Security">Security</option>
          <option value="Enterprise plan">Enterprise plan</option>
        </select>
      </label>

      <label className="grid gap-2">
        <span>Message</span>
        <textarea
          required
          minLength={10}
          maxLength={5000}
          name="message"
          rows={6}
          className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3"
        />
      </label>

      <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <button
        type="submit"
        disabled={state === 'sending'}
        className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-6 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === 'sending' ? 'Sending…' : 'Send message'}
      </button>

      {state === 'sent' ? (
        <p role="status" className="text-emerald-300">
          {feedback}
        </p>
      ) : null}

      {state === 'error' ? (
        <p role="alert" className="text-rose-300">
          {feedback}
        </p>
      ) : null}
    </form>
  )
}

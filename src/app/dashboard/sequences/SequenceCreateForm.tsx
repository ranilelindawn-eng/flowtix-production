'use client'

import { useMemo, useState } from 'react'

import { createSequence } from '../crm-actions'

type MessageTemplate = {
  id: string
  name: string
  channel: 'email' | 'sms'
  subject: string | null
  body: string
}

const fieldClass =
  'min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white'

type SequenceChannel = 'email' | 'sms' | 'task' | 'call'

export default function SequenceCreateForm({
  templates,
}: {
  templates: MessageTemplate[]
}) {
  const [channel, setChannel] = useState<SequenceChannel>('email')
  const [templateId, setTemplateId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templateId, templates],
  )

  function applyTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId)
    const template = templates.find((item) => item.id === nextTemplateId)

    if (!template) return

    setChannel(template.channel)
    setSubject(template.channel === 'email' ? template.subject ?? '' : '')
    setBody(template.body)
  }

  function changeChannel(nextChannel: SequenceChannel) {
    setChannel(nextChannel)

    if (
      selectedTemplate &&
      (nextChannel === 'task' ||
        nextChannel === 'call' ||
        selectedTemplate.channel !== nextChannel)
    ) {
      setTemplateId('')
    }

    if (nextChannel !== 'email') {
      setSubject('')
    }
  }

  return (
    <form
      action={createSequence}
      className="grid gap-3 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 md:grid-cols-2"
    >
      <input
        required
        name="name"
        placeholder="Sequence name"
        className={fieldClass}
      />

      <select
        name="channel"
        value={channel}
        onChange={(event) =>
          changeChannel(event.target.value as SequenceChannel)
        }
        className={fieldClass}
      >
        <option value="email">Email first step</option>
        <option value="sms">SMS first step</option>
        <option value="task">Task first step</option>
        <option value="call">Call first step</option>
      </select>

      <input
        name="description"
        placeholder="Description"
        className={`${fieldClass} md:col-span-2`}
      />

      <select
        name="template_id"
        value={templateId}
        onChange={(event) => applyTemplate(event.target.value)}
        disabled={channel === 'task' || channel === 'call'}
        className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2`}
        aria-label="Saved template"
      >
        <option value="">No saved template</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name} · {template.channel.toUpperCase()}
          </option>
        ))}
      </select>

      <input
        name="subject"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        disabled={channel !== 'email'}
        placeholder="First-step subject"
        className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2`}
      />

      <textarea
        required
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        placeholder="First-step content"
        className={`${fieldClass} py-3 md:col-span-2`}
      />

      {selectedTemplate ? (
        <p className="text-xs text-slate-400 md:col-span-2">
          This step is linked to {selectedTemplate.name}. The current subject
          and body are saved as a snapshot when the sequence is created.
        </p>
      ) : null}

      <button className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white md:col-span-2">
        Create sequence
      </button>
    </form>
  )
}

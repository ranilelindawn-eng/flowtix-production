'use client'

import { useMemo, useState } from 'react'

import { sendCommunication } from '../crm-actions'

type MessageSnippet = {
  id: string
  name: string
  shortcut: string
  content: string
}

type MessageTemplate = {
  id: string
  name: string
  channel: 'email' | 'sms'
  subject: string | null
  body: string
}

const fieldClass =
  'min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

export default function CommunicationComposer({
  templates,
  snippets,
}: {
  templates: MessageTemplate[]
  snippets: MessageSnippet[]
}) {
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
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

  function changeChannel(nextChannel: 'email' | 'sms') {
    setChannel(nextChannel)

    if (selectedTemplate && selectedTemplate.channel !== nextChannel) {
      setTemplateId('')
    }

    if (nextChannel === 'sms') {
      setSubject('')
    }
  }

  function changeBody(nextBody: string) {
    const matchingSnippet = snippets.find((snippet) => {
      const shortcut = snippet.shortcut.trim()

      if (!shortcut) return false

      return (
        nextBody === shortcut ||
        nextBody.endsWith(`\n${shortcut}`) ||
        nextBody.endsWith(` ${shortcut}`)
      )
    })

    if (!matchingSnippet) {
      setBody(nextBody)
      return
    }

    const shortcutStart = nextBody.length - matchingSnippet.shortcut.trim().length
    setBody(`${nextBody.slice(0, shortcutStart)}${matchingSnippet.content}`)
  }

  return (
    <form
      action={sendCommunication}
      className="grid gap-3 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 md:grid-cols-2"
    >
      <select
        name="channel"
        value={channel}
        onChange={(event) =>
          changeChannel(event.target.value as 'email' | 'sms')
        }
        className={fieldClass}
      >
        <option value="email">Email</option>
        <option value="sms">SMS</option>
      </select>

      <input
        required
        name="recipient"
        placeholder="Email address or E.164 phone number"
        className={fieldClass}
      />

      <select
        value={templateId}
        onChange={(event) => applyTemplate(event.target.value)}
        className={`${fieldClass} md:col-span-2`}
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
        disabled={channel === 'sms'}
        placeholder="Subject (email only)"
        className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2`}
      />

      <textarea
        required
        name="body"
        value={body}
        onChange={(event) => changeBody(event.target.value)}
        rows={6}
        placeholder="Write your message"
        className={`${fieldClass} py-3 md:col-span-2`}
      />

      {selectedTemplate ? (
        <p className="text-xs text-slate-400 md:col-span-2">
          Loaded from {selectedTemplate.name}. You can edit the subject or
          message before sending.
        </p>
      ) : null}

      <button className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white md:col-span-2">
        Send message
      </button>
    </form>
  )
}

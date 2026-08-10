'use client'

import { useMemo, useState, useTransition } from 'react'
import { Tag, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

import type { CrmTag } from '@/lib/tags'

type Props = {
  contactId: string
  availableTags: CrmTag[]
  assignedTags: CrmTag[]
}

export default function ContactTags({
  contactId,
  availableTags,
  assignedTags,
}: Props) {
  const router = useRouter()
  const [selectedTagId, setSelectedTagId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const assignedIds = useMemo(
    () => new Set(assignedTags.map((tag) => tag.id)),
    [assignedTags],
  )

  const unassignedTags = useMemo(
    () => availableTags.filter((tag) => !assignedIds.has(tag.id)),
    [availableTags, assignedIds],
  )

  async function assignTag() {
    if (!selectedTagId || isPending) return

    setError(null)

    const response = await fetch('/api/crm/tags/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tagId: selectedTagId,
        entityType: 'contact',
        entityId: contactId,
        source: 'manual',
      }),
    })

    const result = (await response.json().catch(() => null)) as
      | { error?: string }
      | null

    if (!response.ok) {
      setError(result?.error ?? 'Unable to assign the tag.')
      return
    }

    setSelectedTagId('')
    startTransition(() => router.refresh())
  }

  async function removeTag(tagId: string) {
    if (isPending) return

    setError(null)

    const response = await fetch('/api/crm/tags/assignments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tagId,
        entityType: 'contact',
        entityId: contactId,
      }),
    })

    const result = (await response.json().catch(() => null)) as
      | { error?: string }
      | null

    if (!response.ok) {
      setError(result?.error ?? 'Unable to remove the tag.')
      return
    }

    startTransition(() => router.refresh())
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.65)]">
      <div className="border-b border-white/10 px-6 py-5">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-cyan-300" />
          <h2 className="text-lg font-semibold text-white">Tags</h2>
        </div>

        <p className="mt-1 text-sm text-slate-400">
          Organize this contact with workspace tags.
        </p>
      </div>

      <div className="space-y-4 p-6">
        {assignedTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {assignedTags.map((tag) => (
              <div
                key={tag.id}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: tag.color }}
                  aria-hidden="true"
                />
                <span>{tag.name}</span>
                <button
                  type="button"
                  onClick={() => void removeTag(tag.id)}
                  disabled={isPending}
                  className="rounded-full p-0.5 text-slate-500 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Remove ${tag.name}`}
                  title={`Remove ${tag.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No tags assigned to this contact.</p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedTagId}
            onChange={(event) => setSelectedTagId(event.target.value)}
            disabled={isPending || unassignedTags.length === 0}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#081523] px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">
              {unassignedTags.length > 0 ? 'Select a tag' : 'No more tags available'}
            </option>
            {unassignedTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void assignTag()}
            disabled={!selectedTagId || isPending}
            className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Assign tag'}
          </button>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}

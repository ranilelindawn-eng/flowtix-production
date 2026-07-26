import { FileText } from 'lucide-react'

import type { ContactNote } from '@/lib/contact-notes'

import AddNoteDialog from './AddNoteDialog'

type ContactNotesProps = {
  contactId: string
  notes: ContactNote[]
}

function formatNoteDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export default function ContactNotes({
  contactId,
  notes,
}: ContactNotesProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.65)]">
      <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Contact Notes
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Internal notes shared with your team.
          </p>
        </div>

        <AddNoteDialog contactId={contactId} />
      </div>

      {notes.length === 0 ? (
        <div className="p-6">
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400">
              <FileText className="h-5 w-5" />
            </div>

            <h3 className="mt-4 font-medium text-white">
              No notes yet
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Add notes after calls to keep your team informed.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-white/10">
          {notes.map((note) => {
            const wasEdited =
              note.updated_at !== note.created_at

            return (
              <article
                key={note.id}
                className="px-6 py-5 transition hover:bg-white/[0.02]"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{formatNoteDate(note.created_at)}</span>

                  {wasEdited ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5">
                      Edited
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">
                  {note.body}
                </p>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
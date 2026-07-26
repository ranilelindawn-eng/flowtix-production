'use client'

type NotesPanelProps = {
  value: string
  disabled?: boolean
  maxLength?: number
  placeholder?: string
  onChange: (value: string) => void
}

export default function NotesPanel({
  value,
  disabled = false,
  maxLength = 2000,
  placeholder = 'Add notes about this call...',
  onChange,
}: NotesPanelProps) {
  const charactersRemaining = Math.max(
    maxLength - value.length,
    0,
  )

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Call notes
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Record important details, outcomes, and follow-up
            information.
          </p>
        </div>

        <span className="shrink-0 text-xs tabular-nums text-slate-500">
          {charactersRemaining} left
        </span>
      </div>

      <label
        htmlFor="call-notes"
        className="sr-only"
      >
        Call notes
      </label>

      <textarea
        id="call-notes"
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        rows={7}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-5 min-h-40 w-full resize-y rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500/40 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      />

      <p className="mt-3 text-xs leading-5 text-slate-500">
        Notes can be saved with the call record and used later
        for follow-up, reporting, and campaign history.
      </p>
    </section>
  )
}
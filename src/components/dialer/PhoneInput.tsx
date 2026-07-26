'use client'

type PhoneInputProps = {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  onBackspace?: () => void
}

export default function PhoneInput({
  value,
  disabled = false,
  onChange,
  onBackspace,
}: PhoneInputProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <label
        htmlFor="phone-number"
        className="block text-xs font-semibold uppercase tracking-wider text-slate-500"
      >
        Phone Number
      </label>

      <div className="mt-2 flex items-center gap-3">
        <input
          id="phone-number"
          type="tel"
          value={value}
          disabled={disabled}
          autoComplete="tel"
          placeholder="+1 555 123 4567"
          onChange={(e) => onChange(e.target.value)}
          className="min-h-12 min-w-0 flex-1 bg-transparent text-xl font-medium tracking-wide text-white outline-none placeholder:text-slate-600 disabled:cursor-not-allowed"
        />

        {value && !disabled && onBackspace ? (
          <button
            type="button"
            onClick={onBackspace}
            aria-label="Remove last digit"
            className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            ⌫
          </button>
        ) : null}
      </div>
    </div>
  )
}
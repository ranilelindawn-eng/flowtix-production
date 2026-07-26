'use client'

type CallControlsProps = {
  isCallActive: boolean
  isConnected: boolean
  isMuted: boolean
  isOnHold: boolean
  showKeypad: boolean
  hasPhoneNumber: boolean
  disabled?: boolean
  onToggleMute: () => void
  onToggleHold: () => void
  onToggleKeypad: () => void
  onClearNumber: () => void
}

export default function CallControls({
  isCallActive,
  isConnected,
  isMuted,
  isOnHold,
  showKeypad,
  hasPhoneNumber,
  disabled = false,
  onToggleMute,
  onToggleHold,
  onToggleKeypad,
  onClearNumber,
}: CallControlsProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
      <h2 className="text-lg font-semibold text-white">
        Call controls
      </h2>

      <p className="mt-1 text-sm text-slate-400">
        Controls become available during an active call.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onToggleMute}
          disabled={!isCallActive || disabled}
          aria-pressed={isMuted}
          className={`rounded-xl border px-4 py-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40 ${
            isMuted
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              : 'border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]'
          }`}
        >
          {isMuted ? 'Unmute' : 'Mute'}
        </button>

        <button
          type="button"
          onClick={onToggleHold}
          disabled={!isConnected || disabled}
          aria-pressed={isOnHold}
          className={`rounded-xl border px-4 py-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40 ${
            isOnHold
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              : 'border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]'
          }`}
        >
          {isOnHold ? 'Resume' : 'Hold'}
        </button>

        <button
          type="button"
          onClick={onToggleKeypad}
          disabled={disabled}
          aria-pressed={showKeypad}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {showKeypad ? 'Hide keypad' : 'Show keypad'}
        </button>

        <button
          type="button"
          onClick={onClearNumber}
          disabled={
            isCallActive ||
            !hasPhoneNumber ||
            disabled
          }
          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </section>
  )
}
'use client'

export type DialPadKey = {
  digit: string
  letters: string
}

type DialPadProps = {
  disabled?: boolean
  maxLengthReached?: boolean
  onDigitPress: (digit: string) => void
}

const DIAL_PAD_KEYS: DialPadKey[] = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
]

export default function DialPad({
  disabled = false,
  maxLengthReached = false,
  onDigitPress,
}: DialPadProps) {
  const isDisabled = disabled || maxLengthReached

  return (
    <div
      className="mx-auto grid max-w-sm grid-cols-3 gap-3"
      aria-label="Dial pad"
    >
      {DIAL_PAD_KEYS.map((key) => (
        <button
          key={key.digit}
          type="button"
          onClick={() => onDigitPress(key.digit)}
          disabled={isDisabled}
          aria-label={
            key.letters
              ? `${key.digit}, ${key.letters}`
              : key.digit
          }
          className="flex aspect-square min-h-16 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white transition hover:border-blue-500/30 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="text-2xl font-semibold">
            {key.digit}
          </span>

          <span
            aria-hidden="true"
            className="mt-1 min-h-4 text-[10px] font-semibold tracking-[0.2em] text-slate-500"
          >
            {key.letters}
          </span>
        </button>
      ))}
    </div>
  )
}
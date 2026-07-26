type CallTimerProps = {
  elapsedSeconds: number
  isVisible: boolean
  isOnHold?: boolean
}

function formatTimer(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, '0'))
      .join(':')
  }

  return [minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

export default function CallTimer({
  elapsedSeconds,
  isVisible,
  isOnHold = false,
}: CallTimerProps) {
  if (!isVisible) {
    return null
  }

  return (
    <div className="mt-2 text-center">
      <p
        className="text-2xl font-semibold tabular-nums text-white"
        aria-label={`Call duration ${formatTimer(elapsedSeconds)}`}
      >
        {formatTimer(elapsedSeconds)}
      </p>

      {isOnHold ? (
        <p className="mt-2 text-sm font-medium text-amber-400">
          Call on hold
        </p>
      ) : null}
    </div>
  )
}
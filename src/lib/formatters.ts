export function formatCallDurationLabel(
  durationSeconds: number | null,
): string {
  if (
    durationSeconds === null ||
    durationSeconds <= 0
  ) {
    return '—'
  }

  const minutes = Math.floor(durationSeconds / 60)
  const seconds = durationSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  if (seconds === 0) {
    return `${minutes}m`
  }

  return `${minutes}m ${seconds}s`
}

export function formatDashboardPercentage(
  value: number,
): string {
  const normalizedValue = Math.min(
    Math.max(Math.round(value), 0),
    100,
  )

  return `${normalizedValue}%`
}
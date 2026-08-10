export const DEFAULT_ORGANIZATION_TIME_ZONE = 'UTC'

export function normalizeTimeZone(value: string | null | undefined): string {
  const candidate = value?.trim()
  if (!candidate) return DEFAULT_ORGANIZATION_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return DEFAULT_ORGANIZATION_TIME_ZONE
  }
}

export function formatDateTimeInTimeZone(
  value: string | number | Date | null | undefined,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
    timeZone: normalizeTimeZone(timeZone),
  }).format(date)
}

export function formatDateInTimeZone(
  value: string | number | Date | null | undefined,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    ...options,
    timeZone: normalizeTimeZone(timeZone),
  }).format(date)
}

function partsAt(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)

  const result: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') result[part.type] = part.value
  }

  return {
    year: Number(result.year),
    month: Number(result.month),
    day: Number(result.day),
    hour: Number(result.hour),
    minute: Number(result.minute),
    second: Number(result.second),
  }
}

export function toOrganizationDateTimeLocal(
  value: string | number | Date | null | undefined,
  timeZone: string,
): string {
  if (value === null || value === undefined || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = partsAt(date, timeZone)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

export function organizationLocalDateTimeToUtc(
  value: string | null | undefined,
  timeZone: string,
): string | null {
  const normalized = value?.trim()
  if (!normalized) return null

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null

  const [, year, month, day, hour, minute, second = '00'] = match
  const target = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )

  let instant = new Date(target)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const represented = partsAt(instant, timeZone)
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    )
    const difference = target - representedUtc
    if (difference === 0) break
    instant = new Date(instant.getTime() + difference)
  }

  return instant.toISOString()
}

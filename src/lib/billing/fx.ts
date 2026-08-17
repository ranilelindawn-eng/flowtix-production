import 'server-only'

export type UsdPhpReferenceQuote = {
  base: 'USD'
  quote: 'PHP'
  rate: number
  rateDate: string
  provider: 'BSP via Frankfurter'
  fetchedAt: string
}

type FrankfurterRateResponse = {
  date?: unknown
  base?: unknown
  quote?: unknown
  rate?: unknown
}

const USD_PHP_ENDPOINT =
  'https://api.frankfurter.dev/v2/rate/USD/PHP?providers=BSP'

const MIN_REASONABLE_USD_PHP_RATE = 20
const MAX_REASONABLE_USD_PHP_RATE = 100

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isReasonableRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_REASONABLE_USD_PHP_RATE &&
    value <= MAX_REASONABLE_USD_PHP_RATE
  )
}

export class FxReferenceRateError extends Error {
  constructor(message = 'The current USD to PHP reference rate is temporarily unavailable.') {
    super(message)
    this.name = 'FxReferenceRateError'
  }
}

export async function getUsdPhpReferenceQuote(): Promise<UsdPhpReferenceQuote> {
  let response: Response

  try {
    response = await fetch(USD_PHP_ENDPOINT, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 * 60 },
    })
  } catch {
    throw new FxReferenceRateError()
  }

  if (!response.ok) throw new FxReferenceRateError()

  let payload: FrankfurterRateResponse
  try {
    payload = (await response.json()) as FrankfurterRateResponse
  } catch {
    throw new FxReferenceRateError()
  }

  if (
    payload.base !== 'USD' ||
    payload.quote !== 'PHP' ||
    !isReasonableRate(payload.rate) ||
    !isIsoDate(payload.date)
  ) {
    throw new FxReferenceRateError()
  }

  return {
    base: 'USD',
    quote: 'PHP',
    rate: payload.rate,
    rateDate: payload.date,
    provider: 'BSP via Frankfurter',
    fetchedAt: new Date().toISOString(),
  }
}

export async function getUsdPhpReferenceQuoteOrNull(): Promise<UsdPhpReferenceQuote | null> {
  try {
    return await getUsdPhpReferenceQuote()
  } catch (error) {
    console.error('USD/PHP REFERENCE RATE ERROR:', error)
    return null
  }
}

export function convertUsdCentsToPhpCentavos(
  usdCents: number,
  usdPhpRate: number,
): number {
  if (!Number.isInteger(usdCents) || usdCents <= 0) {
    throw new Error('A positive USD amount is required for PHP conversion.')
  }
  if (!isReasonableRate(usdPhpRate)) {
    throw new FxReferenceRateError('The USD to PHP reference rate is invalid.')
  }
  const centavos = Math.round(usdCents * usdPhpRate)
  if (!Number.isSafeInteger(centavos) || centavos <= 0) {
    throw new Error('The converted PHP checkout amount is invalid.')
  }
  return centavos
}

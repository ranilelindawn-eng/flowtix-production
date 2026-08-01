const PAYMONGO_API_BASE_URL = 'https://api.paymongo.com/v1'

type PayMongoPrimitive = string | number | boolean | null

export type PayMongoJson =
  | PayMongoPrimitive
  | PayMongoJson[]
  | { [key: string]: PayMongoJson }

type PayMongoRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: PayMongoJson
  headers?: HeadersInit
}

type PayMongoErrorItem = {
  code?: string
  detail?: string
  source?: {
    pointer?: string
    attribute?: string
  }
}

type PayMongoErrorResponse = {
  errors?: PayMongoErrorItem[]
}

export class PayMongoApiError extends Error {
  readonly status: number
  readonly errors: PayMongoErrorItem[]

  constructor(message: string, status: number, errors: PayMongoErrorItem[] = []) {
    super(message)
    this.name = 'PayMongoApiError'
    this.status = status
    this.errors = errors
  }
}

function getPayMongoSecretKey(): string {
  const secretKey = process.env.PAYMONGO_SECRET_KEY?.trim()

  if (!secretKey) {
    throw new Error('Missing PAYMONGO_SECRET_KEY environment variable.')
  }

  if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
    throw new Error('PAYMONGO_SECRET_KEY must be a valid PayMongo secret key.')
  }

  return secretKey
}

function createAuthorizationHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`
}

function getErrorMessage(
  responseBody: PayMongoErrorResponse,
  status: number,
): string {
  const details =
    responseBody.errors
      ?.map((error) => error.detail?.trim())
      .filter((detail): detail is string => Boolean(detail)) ?? []

  if (details.length > 0) {
    return details.join(' ')
  }

  return `PayMongo request failed with status ${status}.`
}

export async function payMongoRequest<TResponse extends PayMongoJson>(
  path: string,
  options: PayMongoRequestOptions = {},
): Promise<TResponse> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const secretKey = getPayMongoSecretKey()

  const response = await fetch(`${PAYMONGO_API_BASE_URL}${normalizedPath}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: createAuthorizationHeader(secretKey),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    cache: 'no-store',
  })

  const responseText = await response.text()
  let responseBody: PayMongoJson = {}

  if (responseText) {
    try {
      responseBody = JSON.parse(responseText) as PayMongoJson
    } catch {
      throw new PayMongoApiError(
        `PayMongo returned an invalid JSON response with status ${response.status}.`,
        response.status,
      )
    }
  }

  if (!response.ok) {
    const errorResponse =
      typeof responseBody === 'object' &&
      responseBody !== null &&
      !Array.isArray(responseBody)
        ? (responseBody as PayMongoErrorResponse)
        : {}

    throw new PayMongoApiError(
      getErrorMessage(errorResponse, response.status),
      response.status,
      errorResponse.errors ?? [],
    )
  }

  return responseBody as TResponse
}
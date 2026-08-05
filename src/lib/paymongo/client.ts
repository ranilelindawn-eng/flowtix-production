import 'server-only'

type PayMongoError = {
  code?: string
  detail?: string
  source?: { pointer?: string }
}

type CheckoutSessionResponse = {
  data?: {
    id?: string
    attributes?: {
      checkout_url?: string
      status?: string
    }
  }
  errors?: PayMongoError[]
}

export type CreatePayMongoCheckoutInput = {
  amount: number
  name: string
  description: string
  customerEmail?: string | null
  metadata: Record<string, string>
  successUrl: string
  cancelUrl: string
}

export class PayMongoApiError extends Error {
  readonly status: number
  readonly errors: PayMongoError[]

  constructor(status: number, errors: PayMongoError[]) {
    const message =
      errors
        .map((item) => item.detail ?? item.code)
        .filter(Boolean)
        .join(', ') || 'PayMongo request failed.'
    super(message)
    this.name = 'PayMongoApiError'
    this.status = status
    this.errors = errors
  }
}

function getSecretKey(): string {
  const secretKey = process.env.PAYMONGO_SECRET_KEY?.trim()
  if (!secretKey) throw new Error('Missing PAYMONGO_SECRET_KEY.')
  return secretKey
}

export async function createPayMongoCheckoutSession(
  input: CreatePayMongoCheckoutInput,
): Promise<{ checkoutId: string; checkoutUrl: string }> {
  const response = await fetch(
    'https://api.paymongo.com/v1/checkout_sessions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'Basic ' +
          Buffer.from(`${getSecretKey()}:`).toString('base64'),
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                currency: 'PHP',
                amount: input.amount,
                name: input.name,
                quantity: 1,
                description: input.description,
              },
            ],
            payment_method_types: ['card', 'gcash', 'paymaya'],
            ...(input.customerEmail
              ? { customer_email: input.customerEmail }
              : {}),
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            metadata: input.metadata,
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
          },
        },
      }),
      cache: 'no-store',
    },
  )

  const result = (await response.json()) as CheckoutSessionResponse
  if (!response.ok) {
    throw new PayMongoApiError(response.status, result.errors ?? [])
  }

  const checkoutId = result.data?.id?.trim()
  const checkoutUrl = result.data?.attributes?.checkout_url?.trim()
  if (!checkoutId || !checkoutUrl) {
    throw new Error('PayMongo did not return a valid checkout session.')
  }

  return { checkoutId, checkoutUrl }
}

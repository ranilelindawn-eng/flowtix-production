import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()

  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable.')
  }

  stripeClient ??= new Stripe(secretKey)
  return stripeClient
}

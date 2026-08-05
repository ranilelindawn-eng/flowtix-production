import 'server-only'

/**
 * @deprecated Stripe billing was retired from Flowtix.
 * Active billing is implemented through PayMongo.
 */
export function getStripe(): never {
  throw new Error('Stripe billing has been retired. Use PayMongo.')
}

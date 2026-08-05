export const payMongoPlans = {
  starter: {
    code: 'starter',
    amount: 170000,
    name: 'Flowtix Starter',
  },
  professional: {
    code: 'pro',
    amount: 460000,
    name: 'Flowtix Professional',
  },
  pro: {
    code: 'pro',
    amount: 460000,
    name: 'Flowtix Professional',
  },
  business: {
    code: 'business',
    amount: 1150000,
    name: 'Flowtix Business',
  },
  enterprise: {
    code: 'enterprise',
    amount: 2900000,
    name: 'Flowtix Enterprise',
  },
} as const

export type PayMongoCheckoutPlanKey = keyof typeof payMongoPlans
export type PayMongoPlanCode =
  (typeof payMongoPlans)[PayMongoCheckoutPlanKey]['code']

export function getPayMongoPlan(value: string) {
  const normalized = value.trim().toLowerCase()
  return payMongoPlans[normalized as PayMongoCheckoutPlanKey] ?? null
}

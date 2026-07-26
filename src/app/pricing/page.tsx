import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ContentSection,
  MarketingHero,
  MarketingShell,
} from '@/components/MarketingShell'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Choose a CallFlow plan and start a 3-day free trial with secure Stripe billing.',
}

const plans = [
  {
    name: 'Starter',
    price: '$29',
    suffix: '/month',
    trial: '3-day free trial',
    description:
      'For freelancers, virtual assistants, and small teams building a reliable calling workflow.',
    href: '/signup?plan=starter',
    featured: false,
    features: [
      'Up to 3 team members',
      '1,000 contacts',
      'Core CRM workspace',
      'Contacts, tasks, and notes',
      'Campaign and call records',
      'Basic reporting',
      'Bring your own calling provider',
    ],
  },
  {
    name: 'Professional',
    price: '$79',
    suffix: '/month',
    trial: '3-day free trial',
    description:
      'For active sales teams that need collaboration, recordings, AI, and advanced workflow tools.',
    href: '/signup?plan=professional',
    featured: true,
    features: [
      'Everything in Starter',
      'Up to 10 team members',
      '10,000 contacts',
      'Team collaboration',
      'Call recordings and transcripts',
      'AI summaries and call analysis',
      'Advanced workflow controls',
      'Advanced analytics',
      'Priority support',
    ],
  },
  {
    name: 'Business',
    price: '$199',
    suffix: '/month',
    trial: '3-day free trial',
    description:
      'For larger organizations that require advanced permissions, onboarding, and support.',
    href: '/signup?plan=business',
    featured: false,
    features: [
      'Everything in Professional',
      'Up to 30 team members',
      'Unlimited contact lists',
      'Advanced permissions',
      'Custom onboarding',
      'Security review support',
      'Integration planning',
      'Priority implementation support',
    ],
  },
]

export default function Page() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Simple pricing"
        title="Start free for 3 days. Pay only when your trial ends."
        description="Create your CallFlow account, securely add your payment details through Stripe, and begin your 3-day free trial. Cancel before the trial ends to avoid being charged."
      />

      <ContentSection title="Plans">
        <div className="mb-10 flex flex-col gap-4 rounded-3xl border border-cyan-400/15 bg-cyan-400/[0.05] px-6 py-5 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-white">
              Payment method required to begin the trial
            </p>
            <p className="mt-1 leading-6 text-slate-400">
              Your selected monthly subscription starts automatically after
              the 3-day trial unless you cancel beforehand.
            </p>
          </div>

          <span className="inline-flex w-fit rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            $0 due today
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`relative flex h-full flex-col rounded-3xl border p-8 ${
                plan.featured
                  ? 'border-cyan-400/40 bg-gradient-to-b from-cyan-400/[0.10] to-white/[0.04] shadow-2xl shadow-cyan-950/30'
                  : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              {plan.featured ? (
                <span className="absolute right-6 top-6 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
                  Most popular
                </span>
              ) : null}

              <div>
                <h2 className="text-2xl font-semibold text-white">
                  {plan.name}
                </h2>

                <div className="mt-6 flex items-end gap-2">
                  <span className="text-4xl font-bold text-white">
                    {plan.price}
                  </span>
                  <span className="pb-1 text-slate-400">{plan.suffix}</span>
                </div>

                <p className="mt-3 font-semibold text-cyan-300">
                  {plan.trial}
                </p>

                <p className="mt-4 leading-7 text-slate-400">
                  {plan.description}
                </p>
              </div>

              <ul className="mt-8 flex-1 space-y-3 text-slate-300">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 font-semibold text-cyan-300"
                    >
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`mt-8 inline-flex items-center justify-center rounded-full px-6 py-3 font-semibold transition hover:-translate-y-0.5 ${
                  plan.featured
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-400 text-white shadow-lg shadow-blue-950/40'
                    : 'border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.10]'
                }`}
              >
                Start 3-Day Free Trial
              </Link>

              <p className="mt-4 text-center text-xs leading-5 text-slate-500">
                Card required. Cancel before the trial ends to avoid the first
                monthly charge.
              </p>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-7 text-slate-400">
          <p className="font-semibold text-white">Usage fees are separate</p>
          <p className="mt-1">
            Telephone numbers, call minutes, messaging, carrier charges,
            transcription processing, and other third-party provider fees are
            not included in the CallFlow subscription price.
          </p>
        </div>
      </ContentSection>
    </MarketingShell>
  )
}

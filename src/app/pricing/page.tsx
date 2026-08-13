import Link from 'next/link'
import {
  ContentSection,
  MarketingHero,
  MarketingShell,
  RelatedLinks,
} from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'AI CRM & Cloud Dialer Pricing',
  description:
    'Compare Flowtix CRM and cloud communications plans for sales teams, with a 7-day free trial, automation, analytics, AI-assisted workflows, and team controls.',
  path: '/pricing',
})

type PricingPlan = {
  name: string
  price: string
  suffix: string
  trial: string
  description: string
  href: string
  featured: boolean
  cta: string
  features: string[]
}

const plans: PricingPlan[] = [
  {
    name: 'Starter',
    price: '₱1,700',
    suffix: '/month',
    trial: '7-day free trial',
    description:
      'For freelancers, virtual assistants, and small teams that need the essential Flowtix CRM workspace.',
    href: '/signup?plan=starter',
    featured: false,
    cta: 'Start 7-Day Free Trial',
    features: [
      'Up to 5 team members including the owner',
      '1,000 contacts',
      'Core CRM workspace',
      'Contacts, companies, pipelines, tasks, notes, and calendar',
      'Manual Email & SMS',
      'Basic campaigns',
      'Basic reporting',
      'Google integration',
    ],
  },
  {
    name: 'Professional',
    price: '₱4,600',
    suffix: '/month',
    trial: '7-day free trial',
    description:
      'For active sales teams that need cloud calling, AI, sequences, advanced reporting, and premium integrations.',
    href: '/signup?plan=professional',
    featured: true,
    cta: 'Start 7-Day Free Trial',
    features: [
      'Everything in Starter',
      'Up to 10 team members including the owner',
      '10,000 contacts',
      'Cloud dialer',
      'Call recordings and transcripts',
      'AI Workspace and chat',
      'AI summaries and call analysis',
      'AI email and task assistance',
      'Sequence automation',
      'Advanced reporting and analytics',
      'Premium integrations',
    ],
  },
  {
    name: 'Business',
    price: '₱11,500',
    suffix: '/month',
    trial: '7-day free trial',
    description:
      'For larger teams that need advanced automation, exports, permissions, security controls, and API access.',
    href: '/signup?plan=business',
    featured: false,
    cta: 'Start 7-Day Free Trial',
    features: [
      'Everything in Professional',
      'Up to 30 team members including the owner',
      'Advanced automation controls',
      'Post-call email and SMS automation',
      'Campaign automation',
      'Data exports',
      'Advanced roles and permissions',
      'Advanced security controls',
      'API access',
      'Premium integrations',
      'Priority onboarding and support',
    ],
  },
  {
    name: 'Enterprise',
    price: '₱29,000',
    suffix: '/month',
    trial: '7-day free trial',
    description:
      'For high-volume organizations that need unlimited scale, advanced automation, enterprise controls, and priority support.',
    href: '/signup?plan=enterprise',
    featured: false,
    cta: 'Start 7-Day Free Trial',
    features: [
      'Everything in Business',
      'Unlimited team members',
      'Unlimited contacts',
      'Unlimited storage',
      'Unlimited calls',
      'Advanced automation controls',
      'Enterprise roles and security controls',
      'API access',
      'Priority onboarding and support',
      'Premium integrations',
    ],
  },
]

export default function Page() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Simple pricing"
        title="Start free for 7 days. No charge today."
        description="Create your Flowtix account and begin your selected plan immediately for 7 days. No payment is taken at signup. Before the trial ends, complete PayMongo checkout to keep the workspace active."
      />

      <ContentSection title="Plans">
        <div className="mb-10 flex flex-col gap-4 rounded-3xl border border-cyan-400/15 bg-cyan-400/[0.05] px-6 py-5 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-white">
              No payment required to begin the trial
            </p>
            <p className="mt-1 leading-6 text-slate-400">
              Starter, Professional, Business, and Enterprise trials begin
              immediately. Complete PayMongo checkout before the trial ends to
              continue using the workspace afterward.
            </p>
          </div>

          <span className="inline-flex w-fit rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            $0 due today
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
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
                {plan.cta}
              </Link>

              <p className="mt-4 text-center text-xs leading-5 text-slate-500">
                No charge today. Payment is required only if you continue after the 7-day trial.
              </p>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-7 text-slate-400">
          <p className="font-semibold text-white">Usage fees are separate</p>
          <p className="mt-1">
            Telephone numbers, carrier call minutes, SMS delivery, provider usage,
            and other third-party charges are billed separately from the
            Flowtix subscription.
          </p>
        </div>
      </ContentSection>

      <ContentSection title="Choose a plan around your operating needs" intro="Start with the CRM foundation your team needs, then move to plans with cloud communications, AI-assisted workflows, automation, reporting, permissions, security controls, and API access as your operation grows.">
        <div className="grid gap-6 md:grid-cols-3">
          {[['Start with CRM','Starter is aimed at smaller teams that need structured contacts, companies, pipelines, tasks, notes, calendar work, campaigns, and reporting.'],['Add communications and automation','Professional adds the cloud dialer, recordings and transcripts, AI-assisted capabilities, sequences, advanced reporting, and premium integrations.'],['Scale governance and operations','Business and Enterprise add stronger automation, exports, permissions, security controls, API access, larger team capacity, and priority support.']].map(([title, description]) => <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-7"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-300">{description}</p></article>)}
        </div>
      </ContentSection>
      <RelatedLinks
        links={[
          { title: 'Features', description: 'Explore the CRM, communications, automation, AI-assisted workflows, analytics, and team capabilities included in Flowtix.', href: '/features' },
          { title: 'Integrations', description: 'Review the provider-neutral integration architecture for telephony, AI, automation, and business data.', href: '/integrations' },
          { title: 'Help Center', description: 'Find setup guidance and answers before or during your Flowtix trial.', href: '/help' },
        ]}
      />
    </MarketingShell>
  )
}
import Link from 'next/link'
import {
  ContentSection,
  MarketingHero,
  MarketingShell,
  RelatedLinks,
} from '@/components/MarketingShell'
import {
  FLOWTIX_PLAN_ORDER,
  FLOWTIX_PLANS,
} from '@/lib/plans/catalog'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'AI CRM & Cloud Dialer Pricing',
  description:
    'Compare Flowtix Starter, Professional, Business, and Enterprise plans. Starter, Professional, and Business include a 7-day free trial; Enterprise uses assisted onboarding.',
  path: '/pricing',
})

function formatPublicPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

const plans = FLOWTIX_PLAN_ORDER.map((code) => FLOWTIX_PLANS[code])

export default function Page() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Simple pricing"
        title="Start free for 7 days. No charge today."
        description="Starter, Professional, and Business can begin with a 7-day free trial. Enterprise uses assisted onboarding so custom limits and operating requirements are configured before activation."
      />

      <ContentSection title="Plans">
        <div className="mb-10 flex flex-col gap-4 rounded-3xl border border-cyan-400/15 bg-cyan-400/[0.05] px-6 py-5 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-white">
              No payment required to begin the trial
            </p>
            <p className="mt-1 leading-6 text-slate-400">
              Starter, Professional, and Business can be selected at signup.
              Enterprise uses assisted onboarding before activation. Public plan
              prices are listed in USD. PayMongo settlement is processed in PHP,
              and the exact PHP amount is shown in Billing and at checkout before
              payment.
            </p>
          </div>

          <span className="inline-flex w-fit rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            $0 due today
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const featured = plan.code === 'pro'
            const price = formatPublicPrice(plan.publicPriceUsdCents)

            return (
              <article
                key={plan.code}
                className={`relative flex h-full flex-col rounded-3xl border p-8 ${
                  featured
                    ? 'border-cyan-400/40 bg-gradient-to-b from-cyan-400/[0.10] to-white/[0.04] shadow-2xl shadow-cyan-950/30'
                    : 'border-white/10 bg-white/[0.04]'
                }`}
              >
                {featured ? (
                  <span className="absolute right-6 top-6 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
                    Most popular
                  </span>
                ) : null}

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                    {plan.positioning}
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">
                    {plan.name}
                  </h2>

                  <div className="mt-6 flex items-end gap-2">
                    <span className="text-4xl font-bold text-white">
                      {plan.priceStartsAt ? `From ${price}` : price}
                    </span>
                    <span className="pb-1 text-slate-400">/month</span>
                  </div>

                  <p className="mt-3 font-semibold text-cyan-300">
                    {plan.selfService ? '7-day free trial' : 'Assisted onboarding'}
                  </p>

                  <p className="mt-4 leading-7 text-slate-400">
                    {plan.description}
                  </p>
                </div>

                <ul className="mt-8 flex-1 space-y-3 text-slate-300">
                  {plan.marketingFeatures.map((feature) => (
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
                  href={plan.selfService ? `/signup?plan=${plan.publicSlug}` : '/contact'}
                  className={`mt-8 inline-flex items-center justify-center rounded-full px-6 py-3 font-semibold transition hover:-translate-y-0.5 ${
                    featured
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-400 text-white shadow-lg shadow-blue-950/40'
                      : 'border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.10]'
                  }`}
                >
                  {plan.selfService ? 'Start 7-Day Free Trial' : 'Contact Flowtix'}
                </Link>

                <p className="mt-4 text-center text-xs leading-5 text-slate-500">
                  {plan.selfService
                    ? 'No charge today. Payment is required only if you continue after the 7-day trial.'
                    : 'Enterprise activation requires assisted onboarding and custom capacity planning.'}
                </p>
              </article>
            )
          })}
        </div>

        <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-7 text-slate-400">
          <p className="font-semibold text-white">Usage fees are separate</p>
          <p className="mt-1">
            Telephone numbers, carrier call minutes, SMS delivery, provider
            usage, and other third-party charges are separate from the Flowtix
            subscription. Enterprise capacity is custom rather than unlimited.
          </p>
        </div>
      </ContentSection>

      <ContentSection
        title="Choose a plan around your operating needs"
        intro="Starter covers the core CRM and outbound calling foundation. Professional adds core analytics, transcripts, full automation, and AI. Business adds advanced analytics, workforce controls, advanced permissions, and higher capacity. Enterprise keeps the Business capability set with custom operating limits and support."
      >
        <div className="grid gap-6 md:grid-cols-3">
          {[
            [
              'Start with the core workspace',
              'Starter is designed for smaller teams that need CRM, outbound calling, communications, reporting, and controlled basic automation.',
            ],
            [
              'Add analytics, AI, and automation',
              'Professional adds transcripts, Dashboards, KPI Engine, Sales and Call Analytics, AI Workspace, AI Insights, and full automation.',
            ],
            [
              'Scale operations and governance',
              'Business adds Agent, Campaign, and AI Analytics, Time & Attendance, advanced roles, advanced AI, and higher capacity. Enterprise adds custom limits and support.',
            ],
          ].map(([title, description]) => (
            <article
              key={title}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-7"
            >
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="mt-3 leading-7 text-slate-300">{description}</p>
            </article>
          ))}
        </div>
      </ContentSection>

      <RelatedLinks
        links={[
          {
            title: 'Features',
            description:
              'Explore the CRM, communications, automation, AI-assisted workflows, analytics, and team capabilities included in Flowtix.',
            href: '/features',
          },
          {
            title: 'Integrations',
            description:
              'Review the provider-neutral integration architecture for telephony, AI, automation, and business data.',
            href: '/integrations',
          },
          {
            title: 'Help Center',
            description:
              'Find setup guidance and answers before or during your Flowtix trial.',
            href: '/help',
          },
        ]}
      />
    </MarketingShell>
  )
}

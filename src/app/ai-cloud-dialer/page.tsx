import {
  CardGrid,
  ContentSection,
  MarketingHero,
  MarketingShell,
  RelatedLinks,
} from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'AI Cloud Dialer for Sales Teams',
  description:
    'Explore Flowtix as an AI-ready cloud dialer and CRM workspace for sales teams managing calls, contacts, campaigns, recordings, transcripts, follow-up, and analytics.',
  path: '/ai-cloud-dialer',
})

const capabilities = [
  {
    title: 'Browser-based calling workspace',
    description:
      'Give sales teams a focused cloud dialer interface for provider-connected calling workflows without separating call activity from CRM context.',
  },
  {
    title: 'CRM context during outreach',
    description:
      'Keep contacts, companies, notes, tasks, pipelines, and recent activity available alongside communication workflows.',
  },
  {
    title: 'Campaign and queue workflows',
    description:
      'Organize outbound work with campaigns, membership, queues, ownership, and structured follow-up activity.',
  },
  {
    title: 'Recordings and transcripts',
    description:
      'Store supported call recordings and transcripts inside organization-scoped workflows for review and follow-up.',
  },
  {
    title: 'AI-assisted conversation workflows',
    description:
      'Use AI-ready summaries, analysis, email assistance, and task support when the appropriate external AI provider is configured.',
  },
  {
    title: 'Analytics and team visibility',
    description:
      'Connect call activity with reporting, campaign performance, agent workflows, and CRM outcomes instead of treating calls as isolated events.',
  },
]

const pageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Cloud Dialer for Sales Teams | Flowtix',
  url: 'https://www.flowtix.work/ai-cloud-dialer',
  description:
    'Flowtix combines provider-connected cloud calling workflows with CRM context, campaigns, recordings, transcripts, AI-assisted workflows, and analytics.',
  isPartOf: {
    '@type': 'WebSite',
    name: 'Flowtix',
    url: 'https://www.flowtix.work',
  },
}

export default function Page() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
      />
      <MarketingHero
        eyebrow="AI cloud dialer"
        title="Cloud calling with the CRM context your sales team needs"
        description="Flowtix connects provider-backed calling workflows with contacts, campaigns, follow-up, recordings, transcripts, AI-assisted workflows, and analytics in one sales workspace."
      />
      <ContentSection
        title="AI cloud dialer capabilities"
        intro="A sales dialer becomes more useful when the call, customer record, follow-up work, and team activity stay connected. Flowtix is designed around that shared operating context."
      >
        <CardGrid items={capabilities} />
      </ContentSection>
      <ContentSection
        title="Built for provider-connected calling"
        intro="Real inbound and outbound calling requires a supported telephony provider, phone-number configuration, credentials, callbacks, and successful production validation. Flowtix keeps that provider layer separate from the CRM so teams can manage communication workflows without tying the product to a single carrier."
      >
        <div className="grid gap-6 md:grid-cols-3">
          {[
            ['Provider-neutral architecture', 'Use the Flowtix application layer with supported telephony integrations while keeping carrier configuration and usage outside the CRM data model.'],
            ['Conversation history', 'Connect call records, notes, tasks, recordings, transcripts, and contact activity so the next interaction starts with context.'],
            ['Operational controls', 'Use roles, permissions, organization scoping, usage controls, and audit-aware workflows as calling activity grows.'],
          ].map(([title, description]) => (
            <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-7">
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="mt-3 leading-7 text-slate-300">{description}</p>
            </article>
          ))}
        </div>
      </ContentSection>
      <RelatedLinks
        links={[
          { title: 'Features', description: 'Explore the CRM, communications, automation, analytics, and team capabilities available in Flowtix.', href: '/features' },
          { title: 'AI Features', description: 'Review AI-assisted workflows for summaries, analysis, follow-up, and sales productivity.', href: '/ai-features' },
          { title: 'Pricing', description: 'Compare Flowtix plans for CRM, cloud calling, automation, AI-assisted workflows, and team controls.', href: '/pricing' },
        ]}
      />
    </MarketingShell>
  )
}

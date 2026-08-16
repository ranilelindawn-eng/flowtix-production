import {
  CardGrid,
  ContentSection,
  MarketingHero,
  MarketingShell,
  RelatedLinks,
} from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'Call Center CRM for Teams & Customer Conversations',
  description:
    'Flowtix is an outbound call center CRM workspace for teams managing contacts, outbound call activity, campaigns, recordings, transcripts, tasks, analytics, and permissions.',
  path: '/call-center-crm',
})

const capabilities = [
  { title: 'Shared contact context', description: 'Give agents and managers a common view of contact history, notes, tasks, calls, and related customer activity.' },
  { title: 'Outbound calling workflows', description: 'Organize calling operations with assigned contacts, agent presence, ownership, campaigns, and follow-up workflows.' },
  { title: 'Campaign operations', description: 'Manage campaign members, progress, assignments, and follow-up work from the same organization-scoped workspace.' },
  { title: 'Recordings and transcripts', description: 'Store supported conversation artifacts for review while keeping access aligned with organization permissions and policies.' },
  { title: 'Agent and call analytics', description: 'Bring call activity and agent-oriented reporting together with broader CRM and campaign context.' },
  { title: 'Roles, permissions, and auditability', description: 'Use team roles, permissions, tenant isolation, and audit-aware workflows as operations become more complex.' },
]

const pageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Call Center CRM for Teams & Customer Conversations | Flowtix',
  url: 'https://www.flowtix.work/call-center-crm',
  description:
    'Flowtix combines CRM context with outbound call-center workflows including campaigns, recordings, transcripts, tasks, analytics, and team permissions.',
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
        eyebrow="Call center CRM"
        title="Give agents and managers one place for calls and customer context"
        description="Flowtix connects CRM records with outbound calling workflows, campaigns, recordings, transcripts, tasks, analytics, and team controls for conversation-driven operations."
      />
      <ContentSection
        title="CRM and call-center workflows in one workspace"
        intro="When agents have to switch between a dialer, spreadsheet, notes system, and reporting tool, customer context becomes fragmented. Flowtix is designed to keep the operational history together."
      >
        <CardGrid items={capabilities} />
      </ContentSection>
      <ContentSection
        title="Built for structured team operations"
        intro="Outbound call-center workflows depend on more than placing calls. Teams also need ownership, permissions, assigned-contact visibility, follow-up, conversation history, and reporting that can be understood across roles."
      >
        <div className="grid gap-6 md:grid-cols-3">
          {[
            ['For agents', 'Open the customer record with calls, notes, tasks, campaigns, and timeline context needed for the next interaction.'],
            ['For managers', 'Review team activity, campaign progress, call records, analytics, and operational ownership from a shared workspace.'],
            ['For administrators', 'Manage organization membership, roles, permissions, provider configuration, and security-oriented controls as the team grows.'],
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
          { title: 'AI Cloud Dialer', description: 'Explore provider-connected cloud calling with CRM, campaigns, recordings, transcripts, and AI-assisted workflows.', href: '/ai-cloud-dialer' },
          { title: 'Solutions', description: 'See how Flowtix supports sales teams, call centers, agencies, virtual assistants, and growing organizations.', href: '/solutions' },
          { title: 'Pricing', description: 'Compare Flowtix plans for teams that need CRM, cloud calling, automation, analytics, and advanced controls.', href: '/pricing' },
        ]}
      />
    </MarketingShell>
  )
}

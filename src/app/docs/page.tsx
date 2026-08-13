import {
  CardGrid,
  ContentSection,
  MarketingHero,
  MarketingShell,
  RelatedLinks,
} from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'CRM & Cloud Dialer Product Documentation',
  description:
    'Read Flowtix documentation for authentication, organizations, CRM contacts, campaigns, conversation records, security, deployment, and SaaS workspace setup.',
  path: '/docs',
})

const items = [
  { title: 'Authentication', description: 'Supabase SSR authentication protects account and dashboard routes.' },
  { title: 'Organizations', description: 'Each workspace is represented by an organization with membership and role-based access.' },
  { title: 'Contacts', description: 'Contacts are organization-scoped and can be connected to calls, notes, tasks, campaigns, and timeline events.' },
  { title: 'Campaigns', description: 'Campaign records and member queues help coordinate outbound work.' },
  { title: 'Conversation records', description: 'Calls, recordings, transcripts, summaries, and insights use dedicated structured records.' },
  { title: 'Deployment', description: 'Configure environment variables, run validation, and deploy the Next.js application to a supported host.' },
]

export default function Page() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Documentation"
        title="Flowtix product documentation"
        description="Reference guidance for workspace setup, security, data organization, and application workflows."
      />
      <ContentSection title="Explore Flowtix">
        <CardGrid items={items} />
      </ContentSection>
      <ContentSection title="How the Flowtix workspace is organized" intro="The product is built around organizations, members, permissions, CRM records, communications activity, automation, analytics, and provider-backed services. These boundaries help keep customer data and operational actions connected to the correct workspace.">
        <div className="space-y-6">
          {[['1. Establish the organization','Create the workspace, confirm account access, and define the people who should belong to the organization.'],['2. Build the CRM record','Add contacts and companies, then connect notes, tasks, opportunities, campaigns, calls, and timeline activity as work progresses.'],['3. Configure advanced capabilities','Enable plan-appropriate automation, AI, communications, integrations, and reporting only after the required provider and security configuration is complete.'],['4. Validate before production use','Test permissions, workflows, provider callbacks, billing behavior, and customer-facing processes before relying on them for live operations.']].map(([title, description]) => <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-7"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-300">{description}</p></article>)}
        </div>
      </ContentSection>
      <RelatedLinks
        links={[
          { title: 'Features', description: 'See the product capabilities covered by the Flowtix CRM and cloud communications workspace.', href: '/features' },
          { title: 'Integrations', description: 'Review the provider and API integration architecture that extends Flowtix workflows.', href: '/integrations' },
          { title: 'Help Center', description: 'Find practical setup and account guidance for common Flowtix workflows.', href: '/help' },
        ]}
      />
    </MarketingShell>
  )
}

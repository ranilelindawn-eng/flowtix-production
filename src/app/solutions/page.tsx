import {
  CardGrid,
  ContentSection,
  MarketingHero,
  MarketingShell,
  RelatedLinks,
} from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'CRM & Cloud Dialer Solutions for Sales Teams',
  description:
    'See how Flowtix helps sales teams, call centers, agencies, virtual assistants, support teams, and small businesses manage customer conversations and CRM workflows.',
  path: '/solutions',
})

const items = [
  { title: 'Sales teams', description: 'Keep prospects, tasks, campaigns, and call outcomes connected throughout the sales process.' },
  { title: 'Call centers', description: 'Give agents and managers shared visibility into queues, calls, recordings, and follow-up work.' },
  { title: 'Virtual assistants', description: 'Manage multiple client workflows while organization-level data isolation keeps workspaces separate.' },
  { title: 'Agencies', description: 'Coordinate teams, contacts, campaigns, and account activity from one operational workspace.' },
  { title: 'Customer support', description: 'Track customer context, conversation notes, tasks, and resolution-related activity.' },
  { title: 'Small businesses', description: 'Replace disconnected spreadsheets and calling notes with a structured team CRM.' },
]

export default function Page() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Solutions"
        title="Built for conversation-driven teams"
        description="Flowtix brings calling workflows and CRM context together for teams that need clear ownership, reliable records, and secure collaboration."
      />
      <ContentSection title="Explore Flowtix">
        <CardGrid items={items} />
      </ContentSection>
      <ContentSection title="Why conversation-driven teams need shared context" intro="When calling, CRM updates, tasks, and campaign work live in separate tools, teams lose time reconstructing customer history. Flowtix is designed to keep that context inside an organization-scoped workspace.">
        <div className="grid gap-6 md:grid-cols-3">
          {[['For managers','Review ownership, activity, campaign progress, call records, and team performance from a common operating view.'],['For agents and sales reps','Open a contact with the notes, tasks, calls, and timeline context needed to prepare for the next interaction.'],['For growing organizations','Use roles, permissions, tenant isolation, usage controls, and structured workflows as the team and customer database expand.']].map(([title, description]) => <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-7"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-300">{description}</p></article>)}
        </div>
      </ContentSection>
      <RelatedLinks
        links={[
          { title: 'Features', description: 'Explore the CRM, cloud communications, campaign, automation, analytics, and team capabilities in Flowtix.', href: '/features' },
          { title: 'Pricing', description: 'Compare Flowtix plans for small teams, active sales organizations, and larger businesses.', href: '/pricing' },
          { title: 'Documentation', description: 'Review product guidance for workspaces, security, data organization, and core workflows.', href: '/docs' },
        ]}
      />
    </MarketingShell>
  )
}

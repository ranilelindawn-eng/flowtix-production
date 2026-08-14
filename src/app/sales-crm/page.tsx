import {
  CardGrid,
  ContentSection,
  MarketingHero,
  MarketingShell,
  RelatedLinks,
} from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'Sales CRM for Calls, Pipelines & Follow-Up',
  description:
    'Flowtix is a sales CRM for teams that want contacts, companies, pipelines, tasks, calls, campaigns, timelines, and follow-up work in one secure workspace.',
  path: '/sales-crm',
})

const capabilities = [
  { title: 'Contacts and companies', description: 'Keep customer and prospect records organized with the context your team needs for ongoing sales work.' },
  { title: 'Pipelines and opportunities', description: 'Track opportunities through structured pipelines so ownership, value, and next actions stay visible.' },
  { title: 'Tasks and follow-up', description: 'Turn conversations and sales activity into clear next steps with assigned tasks and timeline context.' },
  { title: 'Calls and communications', description: 'Keep call activity and communication records connected with the customer record rather than in a separate system.' },
  { title: 'Campaign workflows', description: 'Organize prospecting and outreach work with campaigns, membership, ownership, status, and queue-aware workflows.' },
  { title: 'Team controls and analytics', description: 'Use roles, permissions, reporting, and organization-scoped access as the sales operation grows.' },
]

const pageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Sales CRM for Calls, Pipelines & Follow-Up | Flowtix',
  url: 'https://www.flowtix.work/sales-crm',
  description:
    'Flowtix brings contacts, companies, pipelines, tasks, calls, campaigns, timelines, and sales-team workflows into one CRM workspace.',
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
        eyebrow="Sales CRM"
        title="Keep your sales pipeline and customer conversations connected"
        description="Flowtix brings CRM records, calls, campaigns, tasks, timelines, analytics, and team workflows together so reps and managers can work from the same customer context."
      />
      <ContentSection
        title="A CRM built around active sales work"
        intro="Instead of maintaining customer records in one tool and communication activity somewhere else, Flowtix is designed to keep the information needed for the next sales action inside the same organization-scoped workspace."
      >
        <CardGrid items={capabilities} />
      </ContentSection>
      <ContentSection
        title="From first contact to next action"
        intro="Sales teams need more than a contact database. They need a reliable operating history that explains what happened, who owns the next step, and how each conversation relates to an opportunity or campaign."
      >
        <div className="grid gap-6 md:grid-cols-3">
          {[
            ['Shared customer context', 'Bring contact details, company information, calls, notes, tasks, and activity history into the same workflow.'],
            ['Clear ownership', 'Use organization membership, roles, assignments, and permissions to make responsibility visible across the team.'],
            ['Measurable operations', 'Connect sales activity with reporting and analytics so managers can understand workflows instead of relying on disconnected spreadsheets.'],
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
          { title: 'Features', description: 'Explore Flowtix CRM, communications, campaigns, automation, analytics, and team workflows.', href: '/features' },
          { title: 'Sales Automation', description: 'See how Flowtix connects sequences, campaign workflows, follow-up, and operational safeguards.', href: '/sales-automation' },
          { title: 'Pricing', description: 'Compare Flowtix plans for small teams, active sales organizations, and larger businesses.', href: '/pricing' },
        ]}
      />
    </MarketingShell>
  )
}

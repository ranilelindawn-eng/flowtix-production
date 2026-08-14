import {
  CardGrid,
  ContentSection,
  MarketingHero,
  MarketingShell,
  RelatedLinks,
} from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'Sales Automation CRM for Follow-Up Workflows',
  description:
    'Explore Flowtix sales automation for sequences, campaigns, post-call follow-up, tasks, background jobs, usage controls, and CRM-connected team workflows.',
  path: '/sales-automation',
})

const capabilities = [
  { title: 'Sequences', description: 'Organize repeatable sales follow-up steps inside a CRM-connected workflow instead of managing every action manually.' },
  { title: 'Campaign automation', description: 'Coordinate campaign membership, status, ownership, and follow-up work with the customer record still in view.' },
  { title: 'Post-call follow-up', description: 'Support structured follow-up actions after conversations so important next steps are less likely to be lost.' },
  { title: 'Task workflows', description: 'Create and manage actionable work that stays connected to contacts, activity history, and team ownership.' },
  { title: 'Durable background work', description: 'Use job-oriented processing, idempotency, and audit-aware patterns for automation that needs to recover safely from retries.' },
  { title: 'Usage and access controls', description: 'Apply organization scoping, permissions, entitlements, and usage enforcement around automated product capabilities.' },
]

const pageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Sales Automation CRM for Follow-Up Workflows | Flowtix',
  url: 'https://www.flowtix.work/sales-automation',
  description:
    'Flowtix connects sales automation with CRM context, sequences, campaigns, follow-up, background jobs, permissions, and usage controls.',
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
        eyebrow="Sales automation"
        title="Automate follow-up without disconnecting it from your CRM"
        description="Flowtix is designed to keep sequences, campaigns, tasks, post-call workflows, background processing, and customer context inside the same sales operating system."
      />
      <ContentSection
        title="Sales automation with operational safeguards"
        intro="Automation is most useful when teams can understand who triggered it, which customer it affects, what should happen next, and how retries or failures are handled. Flowtix keeps those concerns close to the CRM workflow."
      >
        <CardGrid items={capabilities} />
      </ContentSection>
      <ContentSection
        title="Designed for reliable automation"
        intro="Production sales automation needs more than scheduled actions. It also needs ownership, permission checks, usage limits, auditability, and safe retry behavior so growth does not create duplicate or uncontrolled customer activity."
      >
        <div className="grid gap-6 md:grid-cols-3">
          {[
            ['CRM-connected actions', 'Keep automation tied to the contact, campaign, task, and organization context that explains why the work exists.'],
            ['Controlled execution', 'Use entitlements, permissions, usage enforcement, and organization scoping around automation features and background work.'],
            ['Recoverable workflows', 'Idempotency and durable-job patterns help repeated events and retries avoid silently producing duplicate actions.'],
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
          { title: 'Sales CRM', description: 'See how contacts, pipelines, calls, tasks, and customer history stay connected in Flowtix.', href: '/sales-crm' },
          { title: 'Features', description: 'Explore the broader CRM, communications, AI-assisted, analytics, and team capabilities in Flowtix.', href: '/features' },
          { title: 'Pricing', description: 'Compare plans that add automation, cloud communications, AI-assisted workflows, and advanced controls.', href: '/pricing' },
        ]}
      />
    </MarketingShell>
  )
}

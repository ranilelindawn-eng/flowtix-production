import {
  CardGrid,
  ContentSection,
  MarketingHero,
  MarketingShell,
  RelatedLinks,
} from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'AI Cloud Dialer & CRM Features',
  description:
    'Explore Flowtix CRM, cloud communications, campaigns, automation, recordings, transcripts, analytics, and team workflows for modern sales operations.',
  path: '/features',
})

const items = [
  { title: 'Cloud dialer workspace', description: 'Prepare and manage outbound calling workflows from a focused browser-based dialer interface.' },
  { title: 'Contact CRM', description: 'Maintain customer profiles, notes, tasks, recent calls, and a unified activity timeline.' },
  { title: 'Campaign management', description: 'Create campaigns, assign members, manage queues, and track campaign progress.' },
  { title: 'Call records', description: 'Store structured call activity, dispositions, notes, and related contact information.' },
  { title: 'Recordings and transcripts', description: 'Upload and manage recordings and transcripts with organization-scoped access.' },
  { title: 'AI-ready insights', description: 'Create and review summaries and insight records while external AI processing is connected separately.' },
]

export default function Page() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Product features"
        title="Everything your team needs to manage customer conversations"
        description="Organize contacts, calls, campaigns, tasks, recordings, transcripts, summaries, and team activity in one secure workspace."
      />
      <ContentSection title="Explore Flowtix">
        <CardGrid items={items} />
      </ContentSection>
      <ContentSection title="A connected workspace for the full sales conversation" intro="Flowtix is designed to reduce the gaps between CRM records, calling activity, follow-up work, and team visibility. Instead of treating each customer interaction as an isolated event, the workspace keeps the operational context together.">
        <div className="grid gap-6 md:grid-cols-2">
          {[['CRM context that follows the conversation','Contacts can be connected with companies, notes, tasks, calls, campaigns, and timeline activity so teams can review what happened before deciding what happens next.'],['Campaign and queue operations','Organize outbound work with campaign membership, ownership, queues, statuses, and follow-up activity rather than relying on disconnected calling lists.'],['Automation with operational controls','Use sequences and workflow automation to reduce repetitive follow-up while retaining organization-scoped controls, usage enforcement, and auditable activity.'],['Team visibility and analytics','Give managers a clearer view of customer activity, agent work, campaign progress, call outcomes, and performance without moving between separate systems.']].map(([title, description]) => <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-7"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-300">{description}</p></article>)}
        </div>
      </ContentSection>
      <RelatedLinks
        links={[
          { title: 'Solutions', description: 'See how Flowtix supports sales teams, call centers, agencies, virtual assistants, and growing businesses.', href: '/solutions' },
          { title: 'Pricing', description: 'Compare plans, team limits, CRM capabilities, automation, analytics, and advanced controls.', href: '/pricing' },
          { title: 'Integrations', description: 'Review the provider-neutral integration architecture for communications, AI, data, and automation.', href: '/integrations' },
        ]}
      />
    </MarketingShell>
  )
}

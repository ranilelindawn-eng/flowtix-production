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

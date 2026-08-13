import {
  CardGrid,
  ContentSection,
  MarketingHero,
  MarketingShell,
  RelatedLinks,
} from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'AI Sales CRM & Conversation Intelligence',
  description:
    'Explore Flowtix AI-ready sales workflows for transcripts, summaries, insights, human review, organization isolation, and provider-flexible conversation intelligence.',
  path: '/ai-features',
})

const items = [
  { title: 'Transcript management', description: 'Create, review, and organize transcript records associated with customer conversations.' },
  { title: 'Conversation summaries', description: 'Store concise summaries, outcomes, and follow-up information.' },
  { title: 'Insight records', description: 'Capture important themes, risks, opportunities, and quality observations.' },
  { title: 'Human review', description: 'Keep users in control by allowing generated or imported content to be reviewed and edited.' },
  { title: 'Organization isolation', description: 'Apply the same multi-tenant access controls used across the rest of the CRM.' },
  { title: 'Provider flexibility', description: 'Connect an approved AI or transcription provider when your production requirements are defined.' },
]

export default function Page() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="AI features"
        title="AI-ready conversation intelligence"
        description="Flowtix includes structured areas for transcripts, summaries, and insights. Automated AI processing requires a separately configured provider and is never represented as active until connected."
      />
      <ContentSection title="Explore Flowtix">
        <CardGrid items={items} />
      </ContentSection>
      <RelatedLinks
        links={[
          { title: 'Features', description: 'See the broader CRM, communications, campaign, and analytics capabilities surrounding AI workflows.', href: '/features' },
          { title: 'Integrations', description: 'Learn how AI, transcription, telephony, and automation providers connect to Flowtix.', href: '/integrations' },
          { title: 'Pricing', description: 'Compare plans that include AI-assisted workflows and advanced sales capabilities.', href: '/pricing' },
        ]}
      />
    </MarketingShell>
  )
}

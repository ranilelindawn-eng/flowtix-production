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
      <ContentSection title="AI assistance with the CRM record at the center" intro="Flowtix treats AI output as part of a controlled business workflow rather than a replacement for the underlying customer record. Provider-backed capabilities depend on the AI services configured for the workspace.">
        <div className="grid gap-6 md:grid-cols-2">
          {[['From conversation to follow-up','Transcripts and conversation records can support summaries, insights, task assistance, email assistance, and post-call workflows when the required provider capabilities are configured.'],['Human review remains important','Generated content can be reviewed in context before it becomes part of a customer workflow, helping teams keep responsibility for customer-facing decisions.'],['Usage and entitlement controls','AI-related capabilities are designed to work with plan entitlements and usage controls so organizations can manage access as their teams grow.'],['Provider-neutral direction','The AI layer is designed around provider abstraction so the product is not permanently tied to a single language-model or transcription vendor.']].map(([title, description]) => <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-7"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-300">{description}</p></article>)}
        </div>
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

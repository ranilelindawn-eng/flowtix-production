import type { Metadata } from 'next'
import { CardGrid, ContentSection, MarketingHero, MarketingShell } from '@/components/MarketingShell'

export const metadata: Metadata = { title: 'AI-ready conversation intelligence', description: 'Flowtix includes structured areas for transcripts, summaries, and insights. Automated AI processing requires a separately configured provider and is never represented as active until connected.' }
const items = [
  { title: 'Transcript management', description: 'Create, review, and organize transcript records associated with customer conversations.' },
  { title: 'Conversation summaries', description: 'Store concise summaries, outcomes, and follow-up information.' },
  { title: 'Insight records', description: 'Capture important themes, risks, opportunities, and quality observations.' },
  { title: 'Human review', description: 'Keep users in control by allowing generated or imported content to be reviewed and edited.' },
  { title: 'Organization isolation', description: 'Apply the same multi-tenant access controls used across the rest of the CRM.' },
  { title: 'Provider flexibility', description: 'Connect an approved AI or transcription provider when your production requirements are defined.' }
]
export default function Page() { return <MarketingShell><MarketingHero eyebrow='AI features' title='AI-ready conversation intelligence' description='Flowtix includes structured areas for transcripts, summaries, and insights. Automated AI processing requires a separately configured provider and is never represented as active until connected.' /><ContentSection title="Explore Flowtix"><CardGrid items={items} /></ContentSection></MarketingShell> }

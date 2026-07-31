import type { Metadata } from 'next'
import { CardGrid, ContentSection, MarketingHero, MarketingShell } from '@/components/MarketingShell'

export const metadata: Metadata = { title: 'Flowtix product documentation', description: 'Reference guidance for workspace setup, security, data organization, and application workflows.' }
const items = [
  { title: 'Authentication', description: 'Supabase SSR authentication protects account and dashboard routes.' },
  { title: 'Organizations', description: 'Each workspace is represented by an organization with membership and role-based access.' },
  { title: 'Contacts', description: 'Contacts are organization-scoped and can be connected to calls, notes, tasks, campaigns, and timeline events.' },
  { title: 'Campaigns', description: 'Campaign records and member queues help coordinate outbound work.' },
  { title: 'Conversation records', description: 'Calls, recordings, transcripts, summaries, and insights use dedicated structured records.' },
  { title: 'Deployment', description: 'Configure environment variables, run validation, and deploy the Next.js application to a supported host.' }
]
export default function Page() { return <MarketingShell><MarketingHero eyebrow='Documentation' title='Flowtix product documentation' description='Reference guidance for workspace setup, security, data organization, and application workflows.' /><ContentSection title="Explore Flowtix"><CardGrid items={items} /></ContentSection></MarketingShell> }

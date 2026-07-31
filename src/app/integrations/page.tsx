import type { Metadata } from 'next'
import { CardGrid, ContentSection, MarketingHero, MarketingShell } from '@/components/MarketingShell'

export const metadata: Metadata = { title: 'Connect Flowtix to your operating stack', description: 'The integration architecture is designed for secure, organization-scoped connections. Individual providers must be configured before their features become active.' }
const items = [
  { title: 'Supabase', description: 'Authentication, PostgreSQL data storage, Row Level Security, and storage policies.' },
  { title: 'Telephony providers', description: 'A provider adapter is prepared for future connection to services such as Telnyx or Twilio.' },
  { title: 'CRM imports', description: 'Bring contact data into Flowtix using controlled import workflows as they are enabled.' },
  { title: 'Automation tools', description: 'Use webhooks or automation platforms for approved workflows after endpoints are configured.' },
  { title: 'AI providers', description: 'Connect transcription or language-model services under your own provider terms.' },
  { title: 'Custom workflows', description: 'Extend the platform using server-side integrations without exposing private credentials in the browser.' }
]
export default function Page() { return <MarketingShell><MarketingHero eyebrow='Integrations' title='Connect Flowtix to your operating stack' description='The integration architecture is designed for secure, organization-scoped connections. Individual providers must be configured before their features become active.' /><ContentSection title="Explore Flowtix"><CardGrid items={items} /></ContentSection></MarketingShell> }

import type { Metadata } from 'next'
import { CardGrid, ContentSection, MarketingHero, MarketingShell } from '@/components/MarketingShell'

export const metadata: Metadata = { title: 'Flowtix Help Center', description: 'Find setup guidance, account help, and answers about the current Flowtix application.' }
const items = [
  { title: 'Getting started', description: 'Create an account, verify your email if required, and complete your workspace profile.' },
  { title: 'Account access', description: 'Use the login, password reset, and security settings pages to manage access.' },
  { title: 'Contacts and tasks', description: 'Create contacts, add notes and tasks, and review the unified activity timeline.' },
  { title: 'Campaigns', description: 'Create a campaign, add contacts, and manage campaign members.' },
  { title: 'Recordings and transcripts', description: 'Upload supported records and keep sensitive content within the correct organization.' },
  { title: 'Calling setup', description: 'The dialer interface requires a configured telephony provider before real calls can be placed.' }
]
export default function Page() { return <MarketingShell><MarketingHero eyebrow='Support' title='Flowtix Help Center' description='Find setup guidance, account help, and answers about the current Flowtix application.' /><ContentSection title="Explore Flowtix"><CardGrid items={items} /></ContentSection></MarketingShell> }

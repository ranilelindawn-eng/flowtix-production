import type { Metadata } from 'next'
import { CardGrid, ContentSection, MarketingHero, MarketingShell } from '@/components/MarketingShell'

export const metadata: Metadata = { title: 'Built for conversation-driven teams', description: 'Flowtix brings calling workflows and CRM context together for teams that need clear ownership, reliable records, and secure collaboration.' }
const items = [
  { title: 'Sales teams', description: 'Keep prospects, tasks, campaigns, and call outcomes connected throughout the sales process.' },
  { title: 'Call centers', description: 'Give agents and managers shared visibility into queues, calls, recordings, and follow-up work.' },
  { title: 'Virtual assistants', description: 'Manage multiple client workflows while organization-level data isolation keeps workspaces separate.' },
  { title: 'Agencies', description: 'Coordinate teams, contacts, campaigns, and account activity from one operational workspace.' },
  { title: 'Customer support', description: 'Track customer context, conversation notes, tasks, and resolution-related activity.' },
  { title: 'Small businesses', description: 'Replace disconnected spreadsheets and calling notes with a structured team CRM.' }
]
export default function Page() { return <MarketingShell><MarketingHero eyebrow='Solutions' title='Built for conversation-driven teams' description='Flowtix brings calling workflows and CRM context together for teams that need clear ownership, reliable records, and secure collaboration.' /><ContentSection title="Explore Flowtix"><CardGrid items={items} /></ContentSection></MarketingShell> }

import type { Metadata } from 'next'
import { CardGrid, ContentSection, MarketingHero, MarketingShell } from '@/components/MarketingShell'

export const metadata: Metadata = { title: 'Flowtix Blog', description: 'Product notes and practical guidance for building better customer-conversation workflows.' }
const items = [
  { title: 'Designing a secure multi-tenant CRM', description: 'Why organization scoping and Row Level Security must be part of the data model from the beginning.' },
  { title: 'Preparing a cloud dialer deployment', description: 'A checklist covering providers, browser permissions, caller identity, compliance, and monitoring.' },
  { title: 'Building useful contact timelines', description: 'How notes, calls, tasks, and campaign events create better customer context.' },
  { title: 'Responsible conversation intelligence', description: 'Why transcripts, summaries, and AI insights need human review and clear retention policies.' },
  { title: 'Campaign operations fundamentals', description: 'Use ownership, membership, status, and follow-up rules to keep campaigns manageable.' },
  { title: 'From prototype to production', description: 'The validation steps that separate an interface demo from a deployable SaaS application.' }
]
export default function Page() { return <MarketingShell><MarketingHero eyebrow='Resources' title='Flowtix Blog' description='Product notes and practical guidance for building better customer-conversation workflows.' /><ContentSection title="Explore Flowtix"><CardGrid items={items} /></ContentSection></MarketingShell> }

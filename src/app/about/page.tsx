import type { Metadata } from 'next'
import { CardGrid, ContentSection, MarketingHero, MarketingShell } from '@/components/MarketingShell'

export const metadata: Metadata = { title: 'About CallFlow', description: 'CallFlow is being built as a secure, multi-tenant cloud dialer and CRM for teams that manage high volumes of customer conversations.' }
const items = [
  { title: 'Our mission', description: 'Help teams turn every customer conversation into clear, organized, actionable work.' },
  { title: 'Product approach', description: 'Combine a practical CRM foundation with calling, campaign, recording, transcript, and insight workflows.' },
  { title: 'Security by design', description: 'Use server-side authorization and PostgreSQL Row Level Security to isolate organization data.' },
  { title: 'Transparent delivery', description: 'Clearly distinguish implemented functionality from services that still require external provider configuration.' },
  { title: 'Built for teams', description: 'Support owners, administrators, managers, agents, and collaborative workflows.' },
  { title: 'Continuous improvement', description: 'Develop the platform in tested phases so new capabilities do not compromise existing functionality.' }
]
export default function Page() { return <MarketingShell><MarketingHero eyebrow='Company' title='About CallFlow' description='CallFlow is being built as a secure, multi-tenant cloud dialer and CRM for teams that manage high volumes of customer conversations.' /><ContentSection title="Explore CallFlow"><CardGrid items={items} /></ContentSection></MarketingShell> }

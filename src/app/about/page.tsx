import { CardGrid, ContentSection, MarketingHero, MarketingShell } from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'About Flowtix AI CRM & Cloud Communications',
  description:
    'Learn how Flowtix is building a secure multi-tenant CRM and cloud communications workspace for sales teams, call centers, agencies, and growing businesses.',
  path: '/about',
})

const items = [
  { title: 'Our mission', description: 'Help teams turn every customer conversation into clear, organized, actionable work.' },
  { title: 'Product approach', description: 'Combine a practical CRM foundation with calling, campaign, recording, transcript, and insight workflows.' },
  { title: 'Security by design', description: 'Use server-side authorization and PostgreSQL Row Level Security to isolate organization data.' },
  { title: 'Transparent delivery', description: 'Clearly distinguish implemented functionality from services that still require external provider configuration.' },
  { title: 'Built for teams', description: 'Support owners, administrators, managers, agents, and collaborative workflows.' },
  { title: 'Continuous improvement', description: 'Develop the platform in tested phases so new capabilities do not compromise existing functionality.' }
]
export default function Page() { return <MarketingShell><MarketingHero eyebrow='Company' title='About Flowtix' description='Flowtix is being built as a secure, multi-tenant cloud dialer and CRM for teams that manage high volumes of customer conversations.' /><ContentSection title="Explore Flowtix"><CardGrid items={items} /></ContentSection></MarketingShell> }

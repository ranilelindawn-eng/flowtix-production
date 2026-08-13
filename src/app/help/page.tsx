import {
  CardGrid,
  ContentSection,
  MarketingHero,
  MarketingShell,
  RelatedLinks,
} from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'CRM & Cloud Dialer Help Center',
  description:
    'Get Flowtix help for account access, CRM contacts, tasks, campaigns, recordings, transcripts, workspace setup, and cloud communications configuration.',
  path: '/help',
})

const items = [
  { title: 'Getting started', description: 'Create an account, verify your email if required, and complete your workspace profile.' },
  { title: 'Account access', description: 'Use the login, password reset, and security settings pages to manage access.' },
  { title: 'Contacts and tasks', description: 'Create contacts, add notes and tasks, and review the unified activity timeline.' },
  { title: 'Campaigns', description: 'Create a campaign, add contacts, and manage campaign members.' },
  { title: 'Recordings and transcripts', description: 'Upload supported records and keep sensitive content within the correct organization.' },
  { title: 'Calling setup', description: 'The dialer interface requires a configured and validated telephony provider before real production calls can be placed.' },
]

export default function Page() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Support"
        title="Flowtix Help Center"
        description="Find setup guidance, account help, and answers about the current Flowtix application."
      />
      <ContentSection title="Explore Flowtix">
        <CardGrid items={items} />
      </ContentSection>
      <RelatedLinks
        links={[
          { title: 'Documentation', description: 'Read reference guidance for Flowtix workspaces, security, CRM data, and application workflows.', href: '/docs' },
          { title: 'Integrations', description: 'Review the integration architecture for communications, AI, automation, and data providers.', href: '/integrations' },
          { title: 'Pricing', description: 'Compare Flowtix plans and the capabilities available as your team grows.', href: '/pricing' },
        ]}
      />
    </MarketingShell>
  )
}

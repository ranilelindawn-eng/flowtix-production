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
      <ContentSection title="Common setup questions" intro="These answers cover the most important concepts to understand before using Flowtix for live customer operations.">
        <div className="space-y-6">
          {[['Do I need a telephony provider to make real calls?','Yes. Browser calling and real inbound or outbound telephony require a supported provider to be configured and validated. A Flowtix subscription does not replace carrier accounts, phone numbers, or provider usage charges.'],['Are provider usage fees included in the subscription?','No. Carrier minutes, phone numbers, SMS, AI-provider usage, and other third-party charges may be billed separately by the provider you connect.'],['How is workspace data separated?','Flowtix uses organization-scoped application logic and database access controls so records belong to the appropriate tenant and membership context.'],['Should I test workflows before using them with customers?','Yes. Validate permissions, automations, calling configuration, callbacks, and customer-facing workflows in your own environment before depending on them in production.']].map(([title, description]) => <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-7"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-300">{description}</p></article>)}
        </div>
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

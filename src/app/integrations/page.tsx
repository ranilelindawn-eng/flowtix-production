import {
  CardGrid,
  ContentSection,
  MarketingHero,
  MarketingShell,
  RelatedLinks,
} from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'CRM, Telephony & AI Integrations',
  description:
    'Explore Flowtix integration architecture for Supabase, telephony providers, CRM imports, automation tools, AI services, webhooks, and custom business workflows.',
  path: '/integrations',
})

const items = [
  { title: 'Supabase', description: 'Authentication, PostgreSQL data storage, Row Level Security, and storage policies.' },
  { title: 'Telephony providers', description: 'A provider-neutral telephony architecture supports provider configuration and validation for supported communications services.' },
  { title: 'CRM imports', description: 'Bring contact data into Flowtix using controlled import workflows as they are enabled.' },
  { title: 'Automation tools', description: 'Use webhooks or automation platforms for approved workflows after endpoints are configured.' },
  { title: 'AI providers', description: 'Connect transcription or language-model services under your own provider terms.' },
  { title: 'Custom workflows', description: 'Extend the platform using server-side integrations without exposing private credentials in the browser.' },
]

export default function Page() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Integrations"
        title="Connect Flowtix to your operating stack"
        description="The integration architecture is designed for secure, organization-scoped connections. Individual providers must be configured and validated before their production features become active."
      />
      <ContentSection title="Explore Flowtix">
        <CardGrid items={items} />
      </ContentSection>
      <ContentSection title="Integration principles for a production SaaS workspace" intro="Flowtix separates provider credentials and server-side integration logic from the browser while keeping connected data scoped to the correct organization.">
        <div className="grid gap-6 md:grid-cols-3">
          {[['Telephony','The telephony layer is designed to support Twilio, Telnyx, Plivo, and SignalWire through provider-neutral interfaces. Each provider still requires its own credentials, number configuration, webhooks, and end-to-end validation before production calling.'],['AI and transcription','Approved language-model and transcription services can be connected behind the Flowtix AI abstraction. Availability depends on the provider configuration and plan entitlements.'],['Webhooks and business workflows','Server-side endpoints and background jobs can connect external workflows while audit, idempotency, organization scope, and failure handling remain part of the application architecture.']].map(([title, description]) => <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-7"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-300">{description}</p></article>)}
        </div>
      </ContentSection>
      <RelatedLinks
        links={[
          { title: 'Features', description: 'See how connected providers support CRM, communications, automation, analytics, and team workflows.', href: '/features' },
          { title: 'Documentation', description: 'Review Flowtix product guidance and workspace architecture before configuring integrations.', href: '/docs' },
          { title: 'Help Center', description: 'Find setup guidance for accounts, contacts, campaigns, records, and communications workflows.', href: '/help' },
        ]}
      />
    </MarketingShell>
  )
}

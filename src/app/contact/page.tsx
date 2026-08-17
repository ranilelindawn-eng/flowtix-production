import { MarketingHero, MarketingShell } from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

import ContactForm from './ContactForm'

export const metadata = createMarketingMetadata({
  title: 'Contact the Flowtix Team',
  description:
    'Contact Flowtix about product setup, CRM workflows, cloud communications, integrations, security, partnerships, or Enterprise requirements.',
  path: '/contact',
})

type ContactPageProps = {
  searchParams: Promise<{ topic?: string }>
}

function contactTopic(value?: string) {
  return value?.trim().toLowerCase() === 'enterprise'
    ? ('Enterprise plan' as const)
    : ('General inquiry' as const)
}

export default async function Page({ searchParams }: ContactPageProps) {
  const params = await searchParams

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Contact"
        title="Talk with the Flowtix team"
        description="Ask about account access, product setup, security, integrations, or Enterprise requirements. Never submit passwords, API keys, authentication codes, or confidential call content."
      />
      <section className="px-6 py-20">
        <div className="mx-auto max-w-2xl">
          <ContactForm initialTopic={contactTopic(params.topic)} />
        </div>
      </section>
    </MarketingShell>
  )
}

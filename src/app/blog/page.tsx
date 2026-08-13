import { CardGrid, ContentSection, MarketingHero, MarketingShell, RelatedLinks } from '@/components/MarketingShell'
import { createMarketingMetadata } from '@/lib/seo'

export const metadata = createMarketingMetadata({
  title: 'Sales CRM, Cloud Dialer & Automation Blog',
  description:
    'Read Flowtix product notes and practical guidance about multi-tenant CRM architecture, cloud communications, automation, customer workflows, and SaaS operations.',
  path: '/blog',
})

const items = [
  { title: 'Designing a secure multi-tenant CRM', description: 'Why organization scoping and Row Level Security must be part of the data model from the beginning.' },
  { title: 'Preparing a cloud dialer deployment', description: 'A checklist covering providers, browser permissions, caller identity, compliance, and monitoring.' },
  { title: 'Building useful contact timelines', description: 'How notes, calls, tasks, and campaign events create better customer context.' },
  { title: 'Responsible conversation intelligence', description: 'Why transcripts, summaries, and AI insights need human review and clear retention policies.' },
  { title: 'Campaign operations fundamentals', description: 'Use ownership, membership, status, and follow-up rules to keep campaigns manageable.' },
  { title: 'From prototype to production', description: 'The validation steps that separate an interface demo from a deployable SaaS application.' }
]
export default function Page() {
  return (
    <MarketingShell>
      <MarketingHero eyebrow="Resources" title="Flowtix Blog" description="Practical guidance for teams building more reliable CRM, cloud communications, automation, and customer-conversation workflows." />
      <ContentSection title="Guides and product notes" intro="Flowtix is still building out its article library. These topics reflect the operational principles behind the product without presenting placeholder cards as published articles."><CardGrid items={items} /></ContentSection>
      <ContentSection title="Production principles behind Flowtix" intro="A useful SaaS workspace needs more than screens. The underlying operating model should protect customer data, make failures recoverable, and keep important actions understandable as the product grows.">
        <div className="grid gap-6 md:grid-cols-2">
          {[['Multi-tenant CRM by design','Organization scoping, membership, roles, permissions, and Row Level Security are most effective when they are part of the data model instead of being added after customer data already exists.'],['Provider-backed features need validation','Telephony and AI interfaces can be implemented in code while still requiring real credentials, callbacks, provider behavior, and end-to-end acceptance testing before they should be called production-ready.'],['Automation needs safeguards','Sequences and background work benefit from idempotency, audit history, usage controls, and explicit ownership so retries and repeated events do not silently create duplicate customer actions.'],['Customer context should stay connected','Contacts become more useful when calls, notes, tasks, campaigns, opportunities, recordings, transcripts, and follow-up work can be understood from the same operational history.']].map(([title, description]) => <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-7"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-300">{description}</p></article>)}
        </div>
      </ContentSection>
      <RelatedLinks links={[{ title: 'Features', description: 'Explore the CRM, communications, automation, analytics, and team capabilities behind Flowtix.', href: '/features' }, { title: 'Documentation', description: 'Review the product architecture and workspace guidance for using Flowtix.', href: '/docs' }, { title: 'Help Center', description: 'Find practical answers about setup, accounts, calling, providers, and production validation.', href: '/help' }]} />
    </MarketingShell>
  )
}

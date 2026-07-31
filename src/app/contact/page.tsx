import type { Metadata } from 'next'
import { MarketingHero, MarketingShell } from '@/components/MarketingShell'
import ContactForm from './ContactForm'
export const metadata: Metadata = { title: 'Contact', description: 'Contact the Flowtix team.' }
export default function Page() { return <MarketingShell><MarketingHero eyebrow="Contact" title="Talk with the Flowtix team" description="Ask about account access, product setup, security, integrations, or business requirements. Never submit passwords, API keys, authentication codes, or confidential call content." /><section className="px-6 py-20"><div className="mx-auto max-w-2xl"><ContactForm /></div></section></MarketingShell> }

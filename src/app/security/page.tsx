import type { Metadata } from 'next'
import { CardGrid, ContentSection, MarketingHero, MarketingShell } from '@/components/MarketingShell'
export const metadata: Metadata = { title: 'Security', description: 'How CallFlow protects account and organization data.' }
const items = [
  { title: 'Supabase SSR authentication', description: 'Sessions are resolved server-side using secure cookie-based authentication patterns.' },
  { title: 'Row Level Security', description: 'PostgreSQL policies scope supported application data to authorized organization members.' },
  { title: 'Role-based authorization', description: 'Workspace roles and server-side checks limit sensitive administrative operations.' },
  { title: 'Secret management', description: 'Private credentials belong in server-side environment variables and are not committed to source control.' },
  { title: 'Data minimization', description: 'Only collect and retain information necessary for legitimate product and customer workflows.' },
  { title: 'Responsible disclosure', description: 'Report suspected vulnerabilities through the contact page without including active secrets or unnecessary personal data.' },
]
export default function Page() { return <MarketingShell><MarketingHero eyebrow="Trust center" title="Security is part of the architecture" description="CallFlow uses server-side authorization and organization-scoped database policies. External carrier, AI, and storage providers must be reviewed and configured separately before production use." /><ContentSection title="Security controls"><CardGrid items={items} /></ContentSection></MarketingShell> }

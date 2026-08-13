import PolicyPage from '@/components/PolicyPage'
import { createMarketingMetadata } from '@/lib/seo'
export const metadata = createMarketingMetadata({
  title: 'Terms of Service',
  description:
    'Read the Flowtix Terms of Service for accounts, workspaces, customer responsibilities, external services, acceptable use, availability, and service terms.',
  path: '/terms',
})

export default function Page() { return <PolicyPage eyebrow="Legal" title="Terms of Service" description="Effective July 24, 2026. These terms govern access to the Flowtix website and application.">
<section><h2>Agreement and eligibility</h2><p>By accessing Flowtix, you agree to these terms and confirm that you are authorized to act for yourself or the organization you represent. Do not use the service where prohibited by law.</p></section>
<section><h2>Accounts and workspaces</h2><p>You are responsible for accurate registration information, credential security, authorized team access, and activity performed through your workspace. Notify Flowtix promptly of suspected unauthorized access.</p></section>
<section><h2>Customer responsibilities</h2><p>You are responsible for your contacts, communications, campaigns, recordings, transcripts, instructions, legal notices, consent, retention settings, and use of connected providers. Flowtix does not provide legal advice.</p></section>
<section><h2>External services</h2><p>Telephony, email, storage, transcription, AI, and other third-party services are governed by their own terms, availability, pricing, and data practices. Features depending on those providers are not active until configured.</p></section>
<section><h2>Acceptable use</h2><p>You must comply with the Acceptable Use Policy and all applicable communications, privacy, consumer protection, anti-spam, recording, and telecommunications laws.</p></section>
<section><h2>Availability and changes</h2><p>The service may change, experience interruptions, or require maintenance. Preview or early-stage functionality may be modified or discontinued. Real-time availability is not promised unless covered by a separate written agreement.</p></section>
<section><h2>Disclaimers and liability</h2><p>To the extent permitted by law, the service is provided without warranties of uninterrupted or error-free operation. Liability is limited to the amount paid for the applicable service during the three months preceding the claim, unless law requires otherwise.</p></section>
<section><h2>Contact</h2><p>Questions about these terms may be submitted through the contact page.</p></section>
</PolicyPage> }

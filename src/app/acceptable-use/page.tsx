import type { Metadata } from 'next'
import PolicyPage from '@/components/PolicyPage'
export const metadata: Metadata = { title: 'Acceptable Use Policy', description: 'Rules for lawful and responsible use of CallFlow.' }
export default function Page() { return <PolicyPage eyebrow="Legal" title="Acceptable Use Policy" description="CallFlow may only be used for lawful, authorized, and responsible communications.">
<section><h2>Prohibited activity</h2><ul><li>Fraud, impersonation, phishing, scams, harassment, threats, stalking, or unlawful surveillance.</li><li>Calls, messages, recordings, or campaigns without required permission, notice, consent, or lawful basis.</li><li>Spam, abusive automation, caller-ID spoofing, robocalling, or evasion of carrier and platform safeguards.</li><li>Uploading malware, exploiting vulnerabilities, disrupting services, or attempting unauthorized access.</li><li>Processing illegal content or highly sensitive data without suitable authorization and safeguards.</li></ul></section>
<section><h2>Communications compliance</h2><p>Users must maintain required consent records, suppression lists, opt-out handling, calling-hour restrictions, identification disclosures, and region-specific compliance controls.</p></section>
<section><h2>Enforcement</h2><p>CallFlow may investigate suspected abuse and restrict or suspend access where reasonably necessary to protect users, providers, the public, or the platform. Serious violations may be reported to relevant providers or authorities.</p></section>
</PolicyPage> }

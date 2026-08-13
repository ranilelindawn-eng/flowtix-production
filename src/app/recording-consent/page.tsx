import PolicyPage from '@/components/PolicyPage'
import { createMarketingMetadata } from '@/lib/seo'
export const metadata = createMarketingMetadata({
  title: 'Call Recording & Consent Notice',
  description:
    'Review Flowtix guidance on call recording, monitoring, transcription, participant notice, consent, access, retention, and connected AI or transcription providers.',
  path: '/recording-consent',
})

export default function Page() { return <PolicyPage eyebrow="Compliance" title="Recording and Consent Notice" description="Recording, monitoring, and transcription laws vary. The organization initiating a call must determine and implement the required notice and consent process.">
<section><h2>Customer responsibility</h2><p>Before recording, monitoring, transcribing, summarizing, or analyzing a communication, customers must identify applicable laws, participant locations, purposes, and consent requirements.</p></section>
<section><h2>Notice and consent</h2><p>Use clear notices and obtain affirmative consent where required. Do not disable provider notices or use Flowtix for covert or unauthorized interception.</p></section>
<section><h2>Access and retention</h2><p>Limit access to authorized users, define retention periods, delete content when no longer needed, and apply additional safeguards to sensitive communications.</p></section>
<section><h2>AI and transcription</h2><p>Connected transcription or AI providers may receive recording or transcript content under their own terms. Customers must review providers and inform participants where required.</p></section>
<section><h2>Not legal advice</h2><p>This notice is general product guidance and not legal advice. Obtain qualified legal advice for the jurisdictions and workflows involved.</p></section>
</PolicyPage> }

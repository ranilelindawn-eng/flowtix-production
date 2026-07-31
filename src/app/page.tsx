import type { Metadata } from 'next'
import CallFlowLandingPage from '@/components/landing/CallFlowLandingPage'

export const metadata: Metadata = {
  title: 'Flowtix | AI Cloud Dialer and CRM',
  description:
    'Power every conversation with Flowtix—cloud calling, CRM, AI summaries, transcripts, campaigns, analytics, and team collaboration in one workspace.',
}

export default function Home() {
  return <CallFlowLandingPage />
}

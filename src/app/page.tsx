import type { Metadata } from 'next'
import FlowtixLandingPage from '@/components/landing/FlowtixLandingPage'

export const metadata: Metadata = {
  metadataBase: new URL('https://flowtix.work'),
  title: 'Flowtix | AI Cloud Dialer and CRM for Modern Sales Teams',
  description:
    'Flowtix combines cloud calling, CRM, AI coaching, call summaries, transcripts, pipelines, campaigns, analytics, and team collaboration in one secure workspace.',
  keywords: [
    'AI cloud dialer',
    'sales CRM',
    'cloud calling software',
    'CRM with dialer',
    'AI sales assistant',
    'call center CRM',
    'sales engagement platform',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: 'https://flowtix.work',
    siteName: 'Flowtix',
    title: 'Flowtix | AI Cloud Dialer and CRM',
    description:
      'Call, organize, automate, coach, and grow from one intelligent sales workspace.',
    images: [
      {
        url: '/social-preview.svg',
        width: 1200,
        height: 630,
        alt: 'Flowtix AI cloud dialer and CRM',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flowtix | AI Cloud Dialer and CRM',
    description:
      'Call, organize, automate, coach, and grow from one intelligent sales workspace.',
    images: ['/social-preview.svg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
}

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Flowtix',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://flowtix.work',
  description:
    'AI-powered cloud dialer and CRM for sales teams, call centers, virtual assistants, and growing businesses.',
  offers: {
    '@type': 'Offer',
    price: '29',
    priceCurrency: 'USD',
  },
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <FlowtixLandingPage />
    </>
  )
}

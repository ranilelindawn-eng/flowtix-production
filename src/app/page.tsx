import type { Metadata } from 'next'
import FlowtixLandingPage from '@/components/landing/FlowtixLandingPage'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.flowtix.work'),
  title: {
    absolute: 'Flowtix | AI Cloud Communications CRM for Sales Teams',
  },
  description:
    'Flowtix brings CRM, cloud communications, workflow automation, AI-assisted sales tools, analytics, pipelines, and team collaboration into one workspace.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: 'https://www.flowtix.work',
    siteName: 'Flowtix',
    title: 'Flowtix | AI Cloud Communications CRM for Sales Teams',
    description:
      'Manage customer relationships, communications, automation, AI-assisted workflows, analytics, and team activity from one sales workspace.',
    images: [
      {
        url: '/social-preview.png',
        width: 1200,
        height: 630,
        alt: 'Flowtix AI cloud communications CRM for sales teams',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flowtix | AI Cloud Communications CRM for Sales Teams',
    description:
      'Manage customer relationships, communications, automation, AI-assisted workflows, analytics, and team activity from one sales workspace.',
    images: ['/social-preview.png'],
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
  url: 'https://www.flowtix.work',
  description:
    'Multi-tenant CRM and cloud communications SaaS for sales teams, call centers, virtual assistants, agencies, and growing businesses.',
  featureList: [
    'Customer relationship management',
    'Sales pipelines',
    'Workflow automation',
    'Team and role management',
    'Analytics and reporting',
    'Cloud communications workflows',
    'AI-assisted sales workflows',
  ],
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

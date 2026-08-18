import type { Metadata } from 'next'
import FlowtixLandingPage from '@/components/landing/FlowtixLandingPage'
import JsonLd from '@/components/seo/JsonLd'
import {
  FLOWTIX_DEFAULT_DESCRIPTION,
  FLOWTIX_SITE_URL,
  FLOWTIX_SOCIAL_IMAGE,
} from '@/lib/seo'

const title = 'Flowtix | AI Cloud Dialer & CRM for Sales Teams'
const description =
  'Flowtix combines cloud calling, CRM, sales automation, AI-assisted workflows, analytics, pipelines, campaigns, and team collaboration in one secure workspace.'
const organizationId = `${FLOWTIX_SITE_URL}/#organization`

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': organizationId,
  name: 'Flowtix',
  url: FLOWTIX_SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${FLOWTIX_SITE_URL}/flowtix-logo-512.png`,
    contentUrl: `${FLOWTIX_SITE_URL}/flowtix-logo-512.png`,
    width: 512,
    height: 512,
  },
  description: FLOWTIX_DEFAULT_DESCRIPTION,
}

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${FLOWTIX_SITE_URL}/#website`,
  name: 'Flowtix',
  alternateName: 'flowtix.work',
  url: FLOWTIX_SITE_URL,
  description: FLOWTIX_DEFAULT_DESCRIPTION,
  inLanguage: 'en',
  publisher: {
    '@id': organizationId,
  },
}

export const metadata: Metadata = {
  title: {
    absolute: title,
  },
  description,
  alternates: {
    canonical: FLOWTIX_SITE_URL,
  },
  openGraph: {
    type: 'website',
    url: FLOWTIX_SITE_URL,
    siteName: 'Flowtix',
    title,
    description,
    images: [
      {
        url: FLOWTIX_SOCIAL_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Flowtix AI cloud dialer and CRM for sales teams',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [FLOWTIX_SOCIAL_IMAGE],
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

export default function Home() {
  return (
    <>
      <JsonLd data={organizationSchema} />
      <JsonLd data={websiteSchema} />
      <FlowtixLandingPage />
    </>
  )
}

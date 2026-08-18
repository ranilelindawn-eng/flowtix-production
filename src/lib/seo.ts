import type { Metadata } from 'next'

export const FLOWTIX_SITE_URL = 'https://www.flowtix.work'
export const FLOWTIX_SOCIAL_IMAGE = `${FLOWTIX_SITE_URL}/social-preview.png`
export const FLOWTIX_SITE_NAME = 'Flowtix'
export const FLOWTIX_DEFAULT_DESCRIPTION =
  'AI cloud dialer and CRM for sales teams managing contacts, pipelines, calls, automation, analytics, and team workflows.'

export function absoluteFlowtixUrl(path: string) {
  return new URL(path === '/' ? '/' : path, `${FLOWTIX_SITE_URL}/`).toString()
}

export function createMarketingMetadata({
  title,
  description,
  path,
}: {
  title: string
  description: string
  path: string
}): Metadata {
  const canonicalUrl = absoluteFlowtixUrl(path)
  const socialTitle = `${title} | ${FLOWTIX_SITE_NAME}`

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      siteName: FLOWTIX_SITE_NAME,
      url: canonicalUrl,
      title: socialTitle,
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
      title: socialTitle,
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
}

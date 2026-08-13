import type { Metadata } from 'next'

export const FLOWTIX_SITE_URL = 'https://www.flowtix.work'
export const FLOWTIX_SOCIAL_IMAGE = '/social-preview.png'

export function createMarketingMetadata({
  title,
  description,
  path,
}: {
  title: string
  description: string
  path: string
}): Metadata {
  const canonicalPath = path === '/' ? '/' : path
  const canonicalUrl = `${FLOWTIX_SITE_URL}${path === '/' ? '' : path}`
  const socialTitle = `${title} | Flowtix`

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      siteName: 'Flowtix',
      url: canonicalUrl,
      title: socialTitle,
      description,
      images: [
        {
          url: FLOWTIX_SOCIAL_IMAGE,
          width: 1200,
          height: 630,
          alt: 'Flowtix AI cloud communications CRM for sales teams',
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

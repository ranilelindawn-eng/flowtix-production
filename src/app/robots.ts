import type { MetadataRoute } from 'next'

const SITE_URL = 'https://www.flowtix.work'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/dashboard/',
          '/platform/',
          '/invite/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}

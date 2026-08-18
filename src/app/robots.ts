import type { MetadataRoute } from 'next'
import { FLOWTIX_SITE_URL } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/'],
      },
    ],
    sitemap: `${FLOWTIX_SITE_URL}/sitemap.xml`,
    host: FLOWTIX_SITE_URL,
  }
}

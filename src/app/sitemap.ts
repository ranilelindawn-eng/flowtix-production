import type { MetadataRoute } from 'next'

const SITE_URL = 'https://www.flowtix.work'

const routes = [
  '',
  '/features',
  '/solutions',
  '/pricing',
  '/ai-features',
  '/integrations',
  '/security',
  '/help',
  '/docs',
  '/contact',
  '/about',
  '/blog',
  '/privacy',
  '/terms',
  '/acceptable-use',
  '/recording-consent',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.7,
  }))
}

import type { MetadataRoute } from 'next'

const SITE_URL = 'https://www.flowtix.work'

const routes = [
  '',
  '/features',
  '/solutions',
  '/pricing',
  '/ai-features',
  '/ai-cloud-dialer',
  '/sales-crm',
  '/sales-automation',
  '/call-center-crm',
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

const highPriorityRoutes = new Set([
  '',
  '/features',
  '/solutions',
  '/pricing',
  '/ai-features',
  '/ai-cloud-dialer',
  '/sales-crm',
  '/sales-automation',
  '/call-center-crm',
])

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : highPriorityRoutes.has(route) ? 0.8 : 0.6,
  }))
}

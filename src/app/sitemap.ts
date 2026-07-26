import type { MetadataRoute } from 'next'
const routes = ['', '/features', '/solutions', '/pricing', '/ai-features', '/integrations', '/security', '/help', '/docs', '/contact', '/about', '/blog', '/privacy', '/terms', '/acceptable-use', '/recording-consent', '/status', '/login', '/signup', '/forgot-password']
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const now = new Date()
  return routes.map((route) => ({ url: `${base}${route}`, lastModified: now, changeFrequency: route === '' ? 'weekly' : 'monthly', priority: route === '' ? 1 : route === '/login' || route === '/signup' ? 0.6 : 0.7 }))
}

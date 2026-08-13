import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '../styles/globals.css'

const siteName = 'Flowtix'
const siteDescription =
  'AI cloud communications CRM for sales teams managing contacts, pipelines, calls, automation, analytics, and team workflows.'

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Flowtix',
  url: 'https://www.flowtix.work',
  logo: 'https://www.flowtix.work/icon.svg',
  description: siteDescription,
}

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Flowtix',
  url: 'https://www.flowtix.work',
  description: siteDescription,
  publisher: {
    '@type': 'Organization',
    name: 'Flowtix',
    url: 'https://www.flowtix.work',
  },
}

export const metadata: Metadata = {
  metadataBase: new URL('https://www.flowtix.work'),
  title: { default: siteName, template: `%s | ${siteName}` },
  description: siteDescription,
  applicationName: siteName,
  authors: [{ name: 'Flowtix' }],
  creator: 'Flowtix',
  publisher: 'Flowtix',
  icons: { icon: '/icon.svg' },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName,
    title: siteName,
    description: siteDescription,
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
    title: siteName,
    description: siteDescription,
    images: ['/social-preview.png'],
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
  themeColor: '#07111F',
}

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="bg-slate-950" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        {children}
      </body>
    </html>
  )
}

import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '../styles/globals.css'
const siteName = 'Flowtix'
const siteDescription = 'Cloud dialer and CRM workspace for contacts, campaigns, calls, tasks, recordings, transcripts, and team collaboration.'
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: siteName, template: `%s | ${siteName}` },
  description: siteDescription, applicationName: siteName,
  keywords: ['cloud dialer','CRM','call management','campaign management','contact management','call transcription'],
  authors: [{ name: 'Flowtix' }], creator: 'Flowtix', publisher: 'Flowtix',
  icons: { icon: '/icon.svg' }, manifest: '/manifest.webmanifest',
  openGraph: { type: 'website', locale: 'en_US', siteName, title: siteName, description: siteDescription, images: [{ url: '/social-preview.svg', width: 1200, height: 630, alt: 'Flowtix cloud dialer and CRM workspace' }] },
  twitter: { card: 'summary_large_image', title: siteName, description: siteDescription, images: ['/social-preview.svg'] },
  robots: { index: true, follow: true },
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, colorScheme: 'dark', themeColor: '#07111F' }
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) { return <html lang="en" className="bg-slate-950" suppressHydrationWarning><body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body></html> }

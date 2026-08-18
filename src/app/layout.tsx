import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import {
  FLOWTIX_DEFAULT_DESCRIPTION,
  FLOWTIX_SITE_NAME,
  FLOWTIX_SITE_URL,
  FLOWTIX_SOCIAL_IMAGE,
} from '@/lib/seo'
import '../styles/globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(FLOWTIX_SITE_URL),
  title: {
    default: 'Flowtix | AI Cloud Dialer & CRM for Sales Teams',
    template: `%s | ${FLOWTIX_SITE_NAME}`,
  },
  description: FLOWTIX_DEFAULT_DESCRIPTION,
  applicationName: FLOWTIX_SITE_NAME,
  authors: [{ name: FLOWTIX_SITE_NAME }],
  creator: FLOWTIX_SITE_NAME,
  publisher: FLOWTIX_SITE_NAME,
  icons: { icon: '/flowtix-logo-512.png', apple: '/flowtix-logo-512.png' },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: FLOWTIX_SITE_NAME,
    title: 'Flowtix | AI Cloud Dialer & CRM for Sales Teams',
    description: FLOWTIX_DEFAULT_DESCRIPTION,
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
    title: 'Flowtix | AI Cloud Dialer & CRM for Sales Teams',
    description: FLOWTIX_DEFAULT_DESCRIPTION,
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
        {children}
      </body>
    </html>
  )
}

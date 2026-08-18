import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Flowtix',
    short_name: 'Flowtix',
    description: 'Cloud dialer and CRM workspace for conversation-driven teams.',
    start_url: '/',
    display: 'standalone',
    background_color: '#070A18',
    theme_color: '#070A18',
    icons: [
      {
        src: '/flowtix-logo-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}

import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest { return { name: 'CallFlow', short_name: 'CallFlow', description: 'Cloud dialer and CRM workspace for conversation-driven teams.', start_url: '/', display: 'standalone', background_color: '#07111F', theme_color: '#07111F', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }] } }

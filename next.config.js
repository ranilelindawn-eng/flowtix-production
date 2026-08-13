/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    const noIndexHeaders = [
      {
        key: 'X-Robots-Tag',
        value: 'noindex, nofollow, noarchive',
      },
    ]

    return [
      { source: '/dashboard/:path*', headers: noIndexHeaders },
      { source: '/platform/:path*', headers: noIndexHeaders },
      { source: '/invite/:path*', headers: noIndexHeaders },
      { source: '/login', headers: noIndexHeaders },
      { source: '/signup', headers: noIndexHeaders },
      { source: '/forgot-password', headers: noIndexHeaders },
      { source: '/reset-password', headers: noIndexHeaders },
      { source: '/status', headers: noIndexHeaders },
    ]
  },
}

module.exports = nextConfig

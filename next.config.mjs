/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOW-FROM https://app.hubspot.com',
          },
          {
            key: 'Content-Security-Policy',
            value: 'frame-ancestors https://app.hubspot.com;',
          },
        ],
      },
    ]
  },
}

export default nextConfig

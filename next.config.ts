import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    // Phosphor ships one module per icon; this keeps the barrel import from
    // pulling the whole set into a route bundle.
    optimizePackageImports: [
      '@phosphor-icons/react',
      '@phosphor-icons/react/dist/ssr',
    ],
  },
}

export default nextConfig

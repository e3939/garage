import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // `next dev` otherwise appends a block about itself to CLAUDE.md on every
  // start. CLAUDE.md is this project's constitution and is written by hand.
  agentRules: false,
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

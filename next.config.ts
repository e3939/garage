import type { NextConfig } from 'next'

/**
 * Storage is private, so every image in the app arrives as a signed URL on the
 * Supabase host. `next/image` refuses a remote host it has not been told about,
 * which is the right default — so the one host we do use is derived from the
 * same environment variable the client is built with rather than written out
 * twice and left to drift between local and production.
 *
 * The path is narrowed to the signed-object endpoint: nothing else on that host
 * should ever be rendered as an image.
 */
function supabaseImagePattern() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return []

  try {
    const parsed = new URL(url)
    return [
      {
        protocol: parsed.protocol.replace(':', '') as 'http' | 'https',
        hostname: parsed.hostname,
        port: parsed.port,
        pathname: '/storage/v1/object/sign/**',
      },
    ]
  } catch {
    return []
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // `next dev` otherwise appends a block about itself to CLAUDE.md on every
  // start. CLAUDE.md is this project's constitution and is written by hand.
  agentRules: false,
  images: {
    remotePatterns: supabaseImagePattern(),
  },
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

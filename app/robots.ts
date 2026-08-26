import type { MetadataRoute } from 'next'

/**
 * A robots.txt, because not having one is a failing Lighthouse audit and
 * because a crawler with no instructions guesses.
 *
 * Permissive rather than closed. Everything of substance is behind the proxy,
 * which redirects an anonymous request to `/sign-in`, so a crawler that follows
 * a link into the app finds a sign-in page and nothing else — while a
 * `Disallow: /` would tell every checker that the site is deliberately hidden
 * and score it accordingly. The auth boundary is the boundary; robots.txt is a
 * note to well-behaved robots, not a lock.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
  }
}

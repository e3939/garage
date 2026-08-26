/**
 * Whether this browsing session has already watched the budget arc sweep in.
 *
 * docs/03-DESIGN.md, signature element 2: "the needle sweeps in on load (600ms,
 * once, then never again during the session)". "The session" is a claim about
 * the browser rather than about a React tree, so it is kept in a cookie with no
 * expiry — which is exactly what a session cookie is, and which the server can
 * read before it renders. That matters: the alternative, deciding in the
 * browser, means the dial is painted mid-sweep and then told to stop, and the
 * flash of that correction is worse than sweeping twice.
 */
export const ARC_SWEPT_COOKIE = 'garage_arc_swept'

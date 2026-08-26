import { NextResponse } from 'next/server'

import { todayIso } from '@/lib/dates'
import { buildBundle, entityCsv, manifestCsv } from '@/lib/export/bundle'
import { findEntity, MANIFEST_TTL_SECONDS } from '@/lib/export/entities'
import { currentUser } from '@/lib/queries/session'

/**
 * The download endpoint. One artifact per request.
 *
 *   /api/export/expenses.csv     one entity
 *   /api/export/attachments-manifest.csv  the manifest, URLs good for 24 hours
 *   /api/export/garage.json      all of it, manifest included
 *
 * A route handler rather than a server action, because what comes back is a
 * file: the browser needs a `Content-Disposition` to save it under a name, and
 * an action returns a value to React rather than a response to the browser.
 *
 * The proxy has already turned an anonymous request into a redirect, and this
 * checks the session again anyway — the same reasoning as the authenticated
 * layout. A matcher typo should not be the only thing standing between a
 * stranger and every row you own.
 */

export const dynamic = 'force-dynamic'

/**
 * `garage.json` reads seventeen tables in pages and signs every attachment. A
 * long-kept ledger is not a fast request, and a truncated export is a lie about
 * what somebody owns, so it gets the longest window every Vercel plan allows.
 */
export const maxDuration = 60

type RouteContext = { params: Promise<{ artifact: string }> }

function fileResponse(body: string, filename: string, contentType: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      'content-type': `${contentType}; charset=utf-8`,
      // The filename is ASCII by construction, so one form of it is enough.
      'content-disposition': `attachment; filename="${filename}"`,
      // Nothing here may sit in a shared cache, and a stale export is a lie
      // about what the ledger currently says.
      'cache-control': 'no-store, private',
    },
  })
}

export async function GET(_request: Request, context: RouteContext) {
  const user = await currentUser()
  if (!user) return new NextResponse('Sign in first', { status: 401 })

  const { artifact } = await context.params
  const stamp = todayIso()

  if (artifact === 'garage.json') {
    const now = new Date()
    const bundle = await buildBundle(
      now.toISOString(),
      new Date(now.getTime() + MANIFEST_TTL_SECONDS * 1000).toISOString(),
    )
    return fileResponse(JSON.stringify(bundle, null, 2), `garage-${stamp}.json`, 'application/json')
  }

  if (artifact === 'attachments-manifest.csv') {
    const expiresAt = new Date(Date.now() + MANIFEST_TTL_SECONDS * 1000).toISOString()
    return fileResponse(
      await manifestCsv(expiresAt),
      `garage-attachments-manifest-${stamp}.csv`,
      'text/csv',
    )
  }

  if (artifact.endsWith('.csv')) {
    const entity = findEntity(artifact.slice(0, -'.csv'.length))
    if (entity) {
      return fileResponse(await entityCsv(entity), `garage-${entity.key}-${stamp}.csv`, 'text/csv')
    }
  }

  return new NextResponse('No such export', { status: 404 })
}

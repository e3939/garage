// Just enough client to hold a dynamic import: `ssr: false` cannot be asked for
// from a Server Component.
'use client'

import dynamic from 'next/dynamic'

import type { InspirationPhoto } from '@/components/mods/before-after'

/**
 * The slider, fetched after the page is interactive.
 *
 * `/garage/[vehicleId]` is the one route already over the 40KB ceiling
 * (AUTOPILOT-NOTES.md, Phase 5) and the comparison is a thing you reach for
 * rather than a thing you read on arrival. The placeholder holds the same 16:9
 * box the images will fill, so nothing on the page moves when it lands.
 */
const BeforeAfter = dynamic(
  () => import('@/components/mods/before-after').then((module) => module.BeforeAfter),
  {
    ssr: false,
    loading: () => <div className="aspect-video w-full rounded-md bg-surface-sunken" />,
  },
)

type BeforeAfterLoaderProps = {
  heroUrl: string
  vehicleName: string
  photos: readonly InspirationPhoto[]
}

/**
 * The heading and the reserved frame are rendered on the server; only the two
 * photographs and the handle wait for the chunk. A section whose title only
 * appeared after hydration would read as the page still loading.
 */
export function BeforeAfterLoader(props: BeforeAfterLoaderProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-eyebrow font-display uppercase text-ink-muted">Before and after</h2>
      <BeforeAfter {...props} />
    </section>
  )
}

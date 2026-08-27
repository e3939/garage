/**
 * How hard every image in the app is squeezed, in one place.
 *
 * These were 1600px and 400KB for everything, shared between a hero that fills
 * the screen and a receipt nobody looks twice at. That is 1.71 bits per pixel
 * on a 4:3 photo, and WebP starts showing blocking on photographic content
 * below roughly 1.5 — so a smooth photo survived it and a car photographed
 * against foliage or gravel did not, because `browser-image-compression` hits a
 * byte cap by winding quality down until it fits.
 *
 * The numbers below are chosen so the cap almost never binds and the encoder
 * gets to keep the quality it wants. Storage is the only cost, and heroes are
 * one per vehicle.
 *
 * There is a second squeeze after this one. Everything renders through
 * `next/image`, which re-encodes at quality 75 by default — a second lossy pass
 * over an already-lossy file, and generation loss shows worst in large flat
 * areas of colour, which on a photo of a car means the paint. `DISPLAY_QUALITY`
 * is the answer to that half, and it is only honoured for values listed in
 * `images.qualities` in `next.config.ts`. Both are here so raising them is one
 * file.
 */

export type ImageRole = 'hero' | 'inspiration' | 'receipt'

export type ImageBudget = {
  /** Long edge in pixels, before encoding. */
  maxEdge: number
  /** Byte ceiling, in megabytes, as `browser-image-compression` wants it. */
  maxMB: number
}

/**
 * What the upload field tells you it is about to do.
 *
 * Derived from the budget rather than written next to it. The hero's caption
 * spent a release saying "1600px" while the code resized to 2560, and a caption
 * that can disagree with the behaviour is how that stayed invisible — the
 * numbers were right and the only thing anyone could see said otherwise.
 */
export function budgetNote(budget: ImageBudget): string {
  return `Resized to ${budget.maxEdge}px and re-encoded as WebP on this device before anything is sent.`
}

export const IMAGE_BUDGETS = {
  /**
   * The vehicle hero and the before/after slider: the one image someone
   * actually looks at. 2560 covers a Pro Max at 3x with room to crop, and
   * 1.5MB across 2560x1920 is 2.56 bits per pixel, comfortably clear of the
   * artefact threshold.
   */
  hero: {
    maxEdge: 2560,
    maxMB: 1.5,
  },

  /**
   * Inspiration and progress photos: opened full-screen in the viewer, so they
   * need real resolution, but there are many per mod rather than one per car.
   */
  inspiration: {
    maxEdge: 2048,
    maxMB: 1.0,
  },

  /**
   * Receipts. Raised from 1600 because small print needs resolution more than
   * it needs quality, and kept tighter than the rest because receipts are the
   * volume item — three hundred of them at 0.6MB is 180MB of a 1GB quota.
   */
  receipt: {
    maxEdge: 2000,
    maxMB: 0.6,
  },
} as const satisfies Record<ImageRole, ImageBudget>

/**
 * Quality for the second pass, `next/image`. Only values listed in
 * `images.qualities` in `next.config.ts` are honoured; changing this means
 * changing that too.
 */
export const DISPLAY_QUALITY = 90

/**
 * Bigger than this and something has gone wrong before we ever see it. Raised
 * alongside the budgets: a 48MP HEIF off a Pro is comfortably past 32MB.
 */
export const MAX_INPUT_BYTES = 64 * 1024 * 1024

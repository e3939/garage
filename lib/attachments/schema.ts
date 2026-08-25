/**
 * The attachment schema, shared client and server like every other entity's
 * (CLAUDE.md section 2). The client imports it as a type only — see the note in
 * `lib/expenses/schema.ts` about zod's weight in a route bundle.
 */

import { z } from 'zod'

/** Storage paths are built by `uploadPath`; this is the shape one must have. */
const storagePath = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .regex(
    /^[0-9a-fA-F-]{36}\/[A-Za-z0-9_-]{1,64}\/[0-9a-zA-Z-]{1,64}\.webp$/,
    'That is not a storage path this app writes',
  )

export const attachmentDraftSchema = z.object({
  id: z.uuid(),
  storage_path: storagePath,
  bucket_name: z.enum(['receipts', 'inspiration', 'vehicles']),
  kind: z.enum(['receipt', 'inspiration', 'progress', 'document']),
  width: z.number().int().min(1).max(30_000).nullable().default(null),
  height: z.number().int().min(1).max(30_000).nullable().default(null),
  bytes: z.number().int().min(0).max(64 * 1024 * 1024).nullable().default(null),
  caption: z
    .string()
    .trim()
    .max(280)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null),
  sort_order: z.number().int().min(0).max(200),
})

/** A whole set, in the order the field put them in. Twelve is a plenty. */
export const attachmentListSchema = z.array(attachmentDraftSchema).max(12)

export type AttachmentDraftInput = z.infer<typeof attachmentDraftSchema>

import { describe, expect, it } from 'vitest'

import { attachmentDraftSchema, attachmentListSchema } from '@/lib/attachments/schema'
import { uploadPath, photoAlt } from '@/lib/attachments/types'

const USER = '8f14e45f-ceea-4e77-a3d5-0aaa0f4a1f30'
const VEHICLE = '3c59dc04-8e88-4504-9b1b-9c0a1e4d2e11'
const FILE = 'b6d767d2-f8ed-4a72-b0f1-6f2b6c3a7d55'

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: FILE,
    storage_path: uploadPath(USER, VEHICLE, FILE),
    bucket_name: 'receipts',
    kind: 'receipt',
    width: 1600,
    height: 1200,
    bytes: 380_000,
    caption: 'Receipt for the tyres',
    sort_order: 0,
    ...overrides,
  }
}

describe('uploadPath', () => {
  it('is {user}/{vehicle}/{uuid}.webp', () => {
    expect(uploadPath(USER, VEHICLE, FILE)).toBe(`${USER}/${VEHICLE}/${FILE}.webp`)
  })

  it('keeps three segments when there is no vehicle', () => {
    // A two-segment path would put the object where a vehicle folder is
    // expected, and the storage policy only checks the first segment.
    expect(uploadPath(USER, null, FILE)).toBe(`${USER}/general/${FILE}.webp`)
  })
})

describe('attachmentDraftSchema', () => {
  it('accepts what the field produces', () => {
    expect(attachmentDraftSchema.safeParse(draft()).success).toBe(true)
    expect(
      attachmentDraftSchema.safeParse(draft({ storage_path: uploadPath(USER, null, FILE) })).success,
    ).toBe(true)
  })

  it('refuses a path this app would never have written', () => {
    for (const path of [
      '../secrets.webp',
      `${USER}/${VEHICLE}/${FILE}.jpg`,
      `${VEHICLE}/${FILE}.webp`,
      `${USER}/${VEHICLE}/../../${FILE}.webp`,
      '',
    ]) {
      expect(attachmentDraftSchema.safeParse(draft({ storage_path: path })).success).toBe(false)
    }
  })

  it('refuses a bucket that does not exist', () => {
    expect(attachmentDraftSchema.safeParse(draft({ bucket_name: 'private' })).success).toBe(false)
  })

  it('turns an empty caption into no caption', () => {
    const parsed = attachmentDraftSchema.parse(draft({ caption: '   ' }))
    expect(parsed.caption).toBeNull()
  })

  it('allows the dimensions to be unknown', () => {
    const parsed = attachmentDraftSchema.parse(draft({ width: null, height: null, bytes: null }))
    expect(parsed.width).toBeNull()
  })
})

describe('attachmentListSchema', () => {
  it('takes an empty set', () => {
    expect(attachmentListSchema.parse([])).toEqual([])
  })

  it('stops at twelve', () => {
    const many = Array.from({ length: 13 }, (_, index) =>
      draft({ id: `b6d767d2-f8ed-4a72-b0f1-6f2b6c3a7d${String(index).padStart(2, '0')}`, sort_order: index }),
    )
    expect(attachmentListSchema.safeParse(many).success).toBe(false)
    expect(attachmentListSchema.safeParse(many.slice(0, 12)).success).toBe(true)
  })
})

describe('photoAlt', () => {
  it('uses the caption when there is one', () => {
    expect(photoAlt('Fresh oil in it', 'oil change')).toBe('Fresh oil in it')
  })

  it('derives from context otherwise', () => {
    // docs/03-DESIGN.md, quality floor: alt text is derived from context.
    expect(photoAlt(null, 'oil change, 12 March')).toBe('Photo of oil change, 12 March')
    expect(photoAlt('  ', 'oil change')).toBe('Photo of oil change')
  })
})

/**
 * The fields a CSV column can be mapped onto, and how a column finds its field
 * on its own.
 *
 * Only expenses are importable. That is the simpler reading of the phase and it
 * is the one that matters: an expense is the entity somebody arrives with a
 * file of, because it is the entity every other app also has. A fuel log or a
 * mod plan comes with this app's own idea of what those are, and there is no
 * file of them in the world to import.
 *
 * The header names on the left of `ALIASES` are the ones `lib/export/entities.ts`
 * writes, so a file exported from this app maps itself with nothing to do. The
 * rest are what other trackers and Vietnamese spreadsheets call the same thing.
 */

import type { ImportFieldKey } from '@/lib/import/types'

export type ImportField = {
  key: ImportFieldKey
  label: string
  /** Without this the row cannot be an expense at all. */
  required: boolean
  /** One line under the dropdown, saying what happens when it is left unmapped. */
  hint: string
}

export const IMPORT_FIELDS: readonly ImportField[] = [
  {
    key: 'occurred_on',
    label: 'Date',
    required: true,
    hint: 'Reads 2026-08-26, 26/08/2026 and 26.08.2026. Day comes first.',
  },
  {
    key: 'amount',
    label: 'Amount',
    required: true,
    hint: 'Reads 150000, 150.000, 150k and -150.000 for a refund.',
  },
  {
    key: 'category',
    label: 'Category',
    required: false,
    hint: 'Matched by name. A name you have not got yet is created.',
  },
  {
    key: 'vehicle',
    label: 'Vehicle',
    required: false,
    hint: 'Matched by nickname. A car this garage has not got is an error, not a new car.',
  },
  {
    key: 'bucket',
    label: 'Bucket',
    required: false,
    hint: 'Life, car running or car project. Unmapped, the category decides.',
  },
  {
    key: 'counts_toward_budget',
    label: 'Counts toward budget',
    required: false,
    hint: 'Yes or no. Unmapped, the category decides.',
  },
  {
    key: 'amortize_months',
    label: 'Spread over months',
    required: false,
    hint: 'Unmapped, every row lands whole in its own month.',
  },
  { key: 'merchant', label: 'Merchant', required: false, hint: 'Where it was spent.' },
  { key: 'note', label: 'Note', required: false, hint: 'Anything else on the row.' },
  {
    key: 'odometer_km',
    label: 'Odometer',
    required: false,
    hint: 'Kilometres. Feeds the vehicle reading, same as the form does.',
  },
  {
    key: 'currency',
    label: 'Currency',
    required: false,
    hint: 'Three letters. Unmapped, everything is read as your base currency.',
  },
  {
    key: 'id',
    label: 'Row id',
    required: false,
    hint: 'Only in a file this app exported. It is what stops a second import making a second copy.',
  },
]

/**
 * Header names that mean each field, already normalised. Accents, case, spaces
 * and punctuation are stripped before comparison, so `Số tiền`, `so tien` and
 * `SO_TIEN` are one entry.
 */
const ALIASES: Readonly<Record<ImportFieldKey, readonly string[]>> = {
  occurred_on: ['occurredon', 'date', 'day', 'when', 'transactiondate', 'ngay', 'ngaychi', 'thoigian'],
  amount: ['amount', 'total', 'value', 'price', 'cost', 'sum', 'sotien', 'giatien', 'tien'],
  category: ['category', 'categoryname', 'type', 'danhmuc', 'loai', 'phanloai'],
  vehicle: ['vehicle', 'car', 'vehiclename', 'nickname', 'xe', 'tenxe'],
  bucket: ['bucket', 'group', 'nhom'],
  counts_toward_budget: [
    'countstowardbudget',
    'countstowardsbudget',
    'budget',
    'inbudget',
    'affectsbudget',
    'tinhvaongansach',
  ],
  amortize_months: ['amortizemonths', 'amortisemonths', 'spreadovermonths', 'months', 'sothang'],
  merchant: ['merchant', 'payee', 'vendor', 'shop', 'store', 'noimua', 'cuahang'],
  note: ['note', 'notes', 'description', 'memo', 'comment', 'ghichu', 'noidung'],
  odometer_km: ['odometerkm', 'odometer', 'odo', 'km', 'mileage', 'sokm'],
  currency: ['currency', 'ccy', 'tiente', 'donvi'],
  id: ['id', 'expenseid', 'rowid', 'uuid'],
}

/** Lower case, no accents, letters and digits only. */
export function normaliseHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export type ColumnMapping = Partial<Record<ImportFieldKey, number>>

/**
 * Guess the mapping from the header row. Every field takes the first column that
 * names it and no column is used twice — a file with both `note` and `notes`
 * gives the field to the one on the left rather than quietly preferring the
 * last.
 */
export function autoMap(header: readonly string[]): ColumnMapping {
  const normalised = header.map(normaliseHeader)
  const taken = new Set<number>()
  const mapping: ColumnMapping = {}

  for (const field of IMPORT_FIELDS) {
    const names = ALIASES[field.key]
    const index = normalised.findIndex(
      (name, position) => !taken.has(position) && name !== '' && names.includes(name),
    )
    if (index >= 0) {
      mapping[field.key] = index
      taken.add(index)
    }
  }

  return mapping
}

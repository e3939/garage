/**
 * What "everything" means, listed once.
 *
 * Every user table in docs/02-DATA-MODEL.md appears here. That is the point of
 * the phase: an export that quietly leaves out parts, or milestones, or the
 * dependency edges between mods, is an export you cannot come back from, and
 * finding that out takes a year.
 *
 * The order is the order the page lists them and the order the JSON bundle
 * writes them: the ledger first, then the cars, then the money tools, then the
 * log. It is also a safe insertion order for anybody rebuilding this by hand —
 * a table never appears before the table it points at.
 *
 * Two conventions:
 *
 *   * The CSV columns are named as the database names them, so a file can be
 *     read against `docs/02-DATA-MODEL.md` without a decoder ring. Expenses are
 *     the exception: the importer reads names rather than ids, so that file
 *     carries `category` and `vehicle` as well as the ids they resolved from,
 *     and carries them early where a person will look.
 *   * Amounts are integer minor units, exactly as stored. Formatting them for a
 *     spreadsheet would mean choosing a locale, and a file that has been through
 *     a locale is a file that has lost something.
 */

import type { Database } from '@/lib/supabase/types'

export type TableName = keyof Database['public']['Tables']

export type ExportEntity = {
  /** The file's base name, and the key it takes in the JSON bundle. */
  key: string
  table: TableName
  label: string
  /** One line on the export screen, saying what is in it. */
  description: string
  /** The PostgREST select. `*` unless a name has to be joined in. */
  select: string
  order: { column: string; ascending: boolean }
  columns: readonly string[]
}

const TIMESTAMPS = ['created_at', 'updated_at'] as const

export const EXPORT_ENTITIES: readonly ExportEntity[] = [
  {
    key: 'expenses',
    table: 'expenses',
    label: 'Expenses',
    description: 'Every row of the ledger, drafts included. This is the file the importer reads.',
    select: '*, category:categories(name), vehicle:vehicles(nickname)',
    order: { column: 'occurred_on', ascending: true },
    columns: [
      'id',
      'occurred_on',
      'amount',
      'currency',
      'category',
      'vehicle',
      'bucket',
      'counts_toward_budget',
      'amortize_months',
      'merchant',
      'note',
      'odometer_km',
      'is_draft',
      'category_id',
      'vehicle_id',
      'mod_plan_id',
      'fund_id',
      'recurring_id',
      ...TIMESTAMPS,
    ],
  },
  {
    key: 'categories',
    table: 'categories',
    label: 'Categories',
    description: 'Names, icons, colours and the two defaults each one carries.',
    select: '*',
    order: { column: 'sort_order', ascending: true },
    columns: [
      'id',
      'name',
      'icon',
      'colour_hex',
      'default_bucket',
      'default_counts_toward_budget',
      'is_system',
      'sort_order',
      'archived_at',
      ...TIMESTAMPS,
    ],
  },
  {
    key: 'vehicles',
    table: 'vehicles',
    label: 'Vehicles',
    description: 'The garage, sold and archived cars included.',
    select: '*',
    order: { column: 'sort_order', ascending: true },
    columns: [
      'id',
      'nickname',
      'make',
      'model',
      'year',
      'trim',
      'plate',
      'colour_hex',
      'fuel_type',
      'transmission',
      'purchase_date',
      'purchase_price',
      'currency',
      'purchase_odometer_km',
      'odometer_km',
      'odometer_at',
      'hero_photo_path',
      'status',
      'sold_date',
      'sold_price',
      'sort_order',
      'archived_at',
      ...TIMESTAMPS,
    ],
  },
  {
    key: 'mod_plans',
    table: 'mod_plans',
    label: 'Mod plans',
    description: 'The board: every mod, its estimate, its status and its links.',
    select: '*',
    order: { column: 'created_at', ascending: true },
    columns: [
      'id',
      'vehicle_id',
      'title',
      'description',
      'status',
      'priority',
      'est_cost_min',
      'est_cost_max',
      'currency',
      'target_date',
      'installed_on',
      'links',
      'notes',
      'board_order',
      'archived_at',
      ...TIMESTAMPS,
    ],
  },
  {
    key: 'mod_dependencies',
    table: 'mod_dependencies',
    label: 'Mod dependencies',
    description: 'Which mod has to happen before which.',
    select: '*',
    order: { column: 'created_at', ascending: true },
    columns: ['mod_plan_id', 'depends_on_id', 'created_at'],
  },
  {
    key: 'service_schedules',
    table: 'service_schedules',
    label: 'Service schedules',
    description: 'The intervals, and when each was last done.',
    select: '*',
    order: { column: 'created_at', ascending: true },
    columns: [
      'id',
      'vehicle_id',
      'name',
      'interval_km',
      'interval_months',
      'last_done_km',
      'last_done_on',
      'notes',
      'archived_at',
      ...TIMESTAMPS,
    ],
  },
  {
    key: 'service_records',
    table: 'service_records',
    label: 'Service records',
    description: 'Work done, when, at what reading, by whom.',
    select: '*',
    order: { column: 'performed_on', ascending: true },
    columns: [
      'id',
      'vehicle_id',
      'schedule_id',
      'name',
      'performed_on',
      'odometer_km',
      'workshop',
      'notes',
      'expense_id',
      ...TIMESTAMPS,
    ],
  },
  {
    key: 'fuel_logs',
    table: 'fuel_logs',
    label: 'Fuel log',
    description: 'Every fill-up. Consumption is computed from these, never stored.',
    select: '*',
    order: { column: 'filled_on', ascending: true },
    columns: [
      'id',
      'vehicle_id',
      'filled_on',
      'odometer_km',
      'litres',
      'total_cost',
      'currency',
      'is_full_tank',
      'missed_previous',
      'station',
      'expense_id',
      ...TIMESTAMPS,
    ],
  },
  {
    key: 'parts',
    table: 'parts',
    label: 'Parts',
    description: 'On the car, on the shelf, sold and binned.',
    select: '*',
    order: { column: 'created_at', ascending: true },
    columns: [
      'id',
      'vehicle_id',
      'name',
      'brand',
      'part_number',
      'status',
      'installed_on',
      'removed_on',
      'warranty_until',
      'expense_id',
      'sale_expense_id',
      'mod_plan_id',
      'notes',
      ...TIMESTAMPS,
    ],
  },
  {
    key: 'budgets',
    table: 'budgets',
    label: 'Budgets',
    description: 'The overall cap and the per-category caps, by month.',
    select: '*',
    order: { column: 'month', ascending: true },
    columns: ['id', 'month', 'category_id', 'amount', 'currency', ...TIMESTAMPS],
  },
  {
    key: 'funds',
    table: 'funds',
    label: 'Funds',
    description: 'Sinking funds and what each is for.',
    select: '*',
    order: { column: 'created_at', ascending: true },
    columns: [
      'id',
      'name',
      'vehicle_id',
      'mod_plan_id',
      'target_amount',
      'monthly_contribution',
      'currency',
      'closed_at',
      ...TIMESTAMPS,
    ],
  },
  {
    key: 'fund_contributions',
    table: 'fund_contributions',
    label: 'Fund contributions',
    description: 'Money in and money out. A balance is the sum of these.',
    select: '*',
    order: { column: 'occurred_on', ascending: true },
    columns: ['id', 'fund_id', 'occurred_on', 'amount', 'note', ...TIMESTAMPS],
  },
  {
    key: 'recurring_expenses',
    table: 'recurring_expenses',
    label: 'Recurring templates',
    description: 'What generates a draft, and when it next lands.',
    select: '*',
    order: { column: 'next_due', ascending: true },
    columns: [
      'id',
      'label',
      'amount',
      'currency',
      'category_id',
      'vehicle_id',
      'bucket',
      'counts_toward_budget',
      'cadence',
      'day_of_month',
      'month_of_year',
      'next_due',
      'active',
      ...TIMESTAMPS,
    ],
  },
  {
    key: 'timeline_notes',
    table: 'timeline_notes',
    label: 'Timeline notes',
    description: 'The cost-free entries: a drive, a wash, a thought.',
    select: '*',
    order: { column: 'occurred_on', ascending: true },
    columns: ['id', 'vehicle_id', 'occurred_on', 'title', 'body', 'odometer_km', ...TIMESTAMPS],
  },
  {
    key: 'milestones',
    table: 'milestones',
    label: 'Milestones',
    description: 'Earned and manual. The stamps in the build log.',
    select: '*',
    order: { column: 'achieved_on', ascending: true },
    columns: ['id', 'vehicle_id', 'kind', 'achieved_on', 'title', 'body', 'auto', ...TIMESTAMPS],
  },
  {
    key: 'attachments',
    table: 'attachments',
    label: 'Attachments',
    description: 'Every photo and document, and what it is attached to. Paths, not pixels.',
    select: '*',
    order: { column: 'created_at', ascending: true },
    columns: [
      'id',
      'bucket_name',
      'storage_path',
      'kind',
      'caption',
      'width',
      'height',
      'bytes',
      'sort_order',
      'expense_id',
      'mod_plan_id',
      'service_record_id',
      'fuel_log_id',
      'part_id',
      'timeline_note_id',
      ...TIMESTAMPS,
    ],
  },
  {
    key: 'profile',
    table: 'profiles',
    label: 'Profile',
    description: 'Your preferences: currency, locale, timezone, units, default view.',
    select: '*',
    order: { column: 'created_at', ascending: true },
    columns: [
      'id',
      'display_name',
      'base_currency',
      'locale',
      'timezone',
      'distance_unit',
      'volume_unit',
      'default_view',
      'amortise_suggest_multiplier',
      ...TIMESTAMPS,
    ],
  },
]

export function findEntity(key: string): ExportEntity | null {
  return EXPORT_ENTITIES.find((entity) => entity.key === key) ?? null
}

/**
 * The columns the attachment manifest carries.
 *
 * `signed_url` is the only column in the whole export that expires. Everything
 * else in the bundle is true forever; a URL is a loan of twenty-four hours,
 * which is what the phase asks for and is long enough to run a download over a
 * connection that drops.
 */
export const MANIFEST_COLUMNS = [
  'attachment_id',
  'bucket',
  'storage_path',
  'kind',
  'caption',
  'bytes',
  'width',
  'height',
  'attached_to',
  'attached_id',
  'signed_url',
  'expires_at',
] as const

/** docs/02-DATA-MODEL.md: signed URLs are 1 hour everywhere else. Here, 24. */
export const MANIFEST_TTL_SECONDS = 24 * 60 * 60

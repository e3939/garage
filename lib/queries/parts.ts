import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { fetchAttachments } from '@/lib/attachments/server'
import { signAttachments } from '@/lib/storage/signed-url'
import type { AttachmentView } from '@/lib/attachments/types'
import type { ExpenseOption, ModOption, Part } from '@/lib/parts/types'

/**
 * The inventory. Every part on the car and every part off it, with what it cost
 * and what it sold for already attached.
 *
 * The two expense joins are separate columns on the row — `expense_id` is the
 * purchase and `sale_expense_id` is the money that came back — so netting the
 * two is an addition and the sign does the work (docs/01-PRODUCT.md, section F).
 */
export async function fetchParts(vehicleId: string): Promise<Part[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('parts')
    .select(
      'id, vehicle_id, name, brand, part_number, status, installed_on, removed_on, warranty_until, expense_id, sale_expense_id, mod_plan_id, notes, ' +
        'purchase:expenses!parts_expense_id_fkey(amount, currency), ' +
        'sale:expenses!parts_sale_expense_id_fkey(amount, currency), ' +
        'mod_plans(title), attachments(id)',
    )
    .eq('vehicle_id', vehicleId)
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw new Error(`parts failed: ${error.message}`)

  type Linked = { amount: number; currency: string } | { amount: number; currency: string }[] | null

  type Raw = Omit<Part, 'cost' | 'sale' | 'currency' | 'mod_title' | 'photo_count'> & {
    purchase: Linked
    sale: Linked
    mod_plans: { title: string } | { title: string }[] | null
    attachments: { id: string }[] | null
  }

  const one = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value

  return ((data ?? []) as unknown as Raw[]).map((row) => {
    const { purchase, sale, mod_plans, attachments, ...part } = row
    const bought = one(purchase)
    const sold = one(sale)

    return {
      ...part,
      cost: bought?.amount ?? null,
      sale: sold?.amount ?? null,
      currency: bought?.currency ?? sold?.currency ?? null,
      mod_title: one(mod_plans)?.title ?? null,
      photo_count: attachments?.length ?? 0,
    }
  })
}

/**
 * Expenses on this car a part could have come out of, newest first.
 *
 * docs/01-PRODUCT.md asks for parts to be added "from an existing expense", and
 * the expense a part came from is nearly always a recent project one — so the
 * list is the last fifty on the car, labelled the way the ledger labels them,
 * and it carries each expense's mod so picking one can also attach the part to
 * the mod it belongs to.
 */
export async function fetchLinkableExpenses(vehicleId: string): Promise<ExpenseOption[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('expenses')
    .select('id, occurred_on, amount, currency, merchant, mod_plan_id, categories(name)')
    .eq('vehicle_id', vehicleId)
    .eq('is_draft', false)
    .gt('amount', 0)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`expenses failed: ${error.message}`)

  type Raw = {
    id: string
    occurred_on: string
    amount: number
    currency: string
    merchant: string | null
    mod_plan_id: string | null
    categories: { name: string } | { name: string }[] | null
  }

  return ((data ?? []) as unknown as Raw[]).map((row) => {
    const category = Array.isArray(row.categories) ? row.categories[0] : row.categories
    return {
      id: row.id,
      occurred_on: row.occurred_on,
      amount: row.amount,
      currency: row.currency,
      label: row.merchant ?? category?.name ?? 'Expense',
      mod_plan_id: row.mod_plan_id,
    }
  })
}

/** The mods a part can belong to. A sale nets against whichever one it was for. */
export async function fetchModOptions(vehicleId: string): Promise<ModOption[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('mod_plans')
    .select('id, title')
    .eq('vehicle_id', vehicleId)
    .is('archived_at', null)
    .order('board_order', { ascending: true })
    .order('title', { ascending: true })

  if (error) throw new Error(`mod_plans failed: ${error.message}`)
  return (data ?? []) as ModOption[]
}

/** One part's photos, signed, for the sheet that edits it. */
export async function fetchPartAttachments(partId: string): Promise<AttachmentView[]> {
  return signAttachments(await fetchAttachments('part', partId))
}

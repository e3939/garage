// Rows with a toggle and a sheet, so the list holds which template is open.
'use client'

import { useState, type ReactNode } from 'react'

import { setRecurringActiveAction } from '@/app/(app)/recurring/actions'
import { RecurringSheet } from '@/components/recurring/recurring-sheet'
import { Money } from '@/components/ui/money'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'
import type { IsoDate } from '@/lib/dates'
import type { CategoryOption, VehicleOption } from '@/lib/expenses/types'
import { CADENCE_LABEL } from '@/lib/recurring/cadence'
import type { RecurringTemplate } from '@/lib/recurring/types'

export type RecurringListProps = {
  templates: readonly RecurringTemplate[]
  categories: readonly CategoryOption[]
  icons: Record<string, ReactNode>
  vehicles: readonly VehicleOption[]
  currency: string
  locale: string
  today: IsoDate
  /** "1 Sep 2026" per template, formatted on the server. */
  dueLabels: Readonly<Record<string, string>>
}

/**
 * The templates, and whether each one is running.
 *
 * Nothing on this screen writes an expense. A template is a standing
 * instruction; the only thing that acts on it is `generate_due_recurrences`,
 * which the cron job calls, and what that produces is a draft in the tray on
 * `/today`. There is deliberately no "generate now" button — it would be a way
 * to put a row in the ledger from a screen whose whole promise is that it never
 * does that on its own.
 */
export function RecurringList({
  templates,
  categories,
  icons,
  vehicles,
  currency,
  locale,
  today,
  dueLabels,
}: RecurringListProps) {
  const toast = useToast()
  const [open, setOpen] = useState<{ template: RecurringTemplate | null } | null>(null)

  async function toggle(template: RecurringTemplate) {
    const next = !template.active
    const result = await setRecurringActiveAction({ id: template.id, active: next })
    if (!result.ok) {
      toast.show(result.error)
      return
    }
    toast.show(next ? `${template.label} running again` : `${template.label} paused`)
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-eyebrow font-display uppercase text-ink-muted">Templates</h2>
        <button
          type="button"
          onClick={() => setOpen({ template: null })}
          className="min-h-touch text-label text-accent"
        >
          Add a template
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-body text-ink-muted">
          No recurring expenses yet. Add one and a draft appears on its due date, waiting for you to
          confirm it.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-md border border-border bg-surface">
          {templates.map((template) => (
            <li key={template.id} className="border-b border-border last:border-b-0">
              <div className="flex items-center gap-3 px-3 py-3">
                <button
                  type="button"
                  onClick={() => setOpen({ template })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span
                      className={[
                        'min-w-0 flex-1 truncate text-body',
                        template.active ? 'text-ink' : 'text-ink-faint',
                      ].join(' ')}
                    >
                      {template.label}
                    </span>
                    {template.amount === null ? null : (
                      <Money
                        amount={template.amount}
                        currency={template.currency}
                        locale={locale}
                        size="odometer"
                        className={template.active ? '' : 'text-ink-faint'}
                      />
                    )}
                  </span>
                  <span className="mt-1 block truncate text-caption text-ink-muted">
                    {CADENCE_LABEL[template.cadence]}
                    {template.category_name ? ` · ${template.category_name}` : null}
                    {template.vehicle_nickname ? ` · ${template.vehicle_nickname}` : null}
                    {template.active
                      ? ` · next ${dueLabels[template.next_due] ?? template.next_due}`
                      : ' · paused'}
                  </span>
                </button>

                <label className="flex shrink-0 cursor-pointer items-center gap-2">
                  <span className="sr-only">{`${template.label} is running`}</span>
                  <input
                    type="checkbox"
                    className="size-5 accent-accent"
                    checked={template.active}
                    onChange={() => void toggle(template)}
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.template ? open.template.label : 'New template'}
      >
        {open ? (
          <RecurringSheet
            mode={open.template ? 'edit' : 'create'}
            initial={open.template}
            categories={categories}
            icons={icons}
            vehicles={vehicles}
            currency={currency}
            locale={locale}
            today={today}
            onDone={() => setOpen(null)}
          />
        ) : null}
      </Sheet>
    </section>
  )
}

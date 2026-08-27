// Filters write to the URL, which is what the Server Component reads.
'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { AmountInput } from '@/components/ui/amount-input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import {
  activeFilterCount,
  filtersToSearchParams,
  EMPTY_FILTERS,
  type LedgerFilters,
} from '@/lib/expenses/filters'
import { BUCKETS, BUCKET_LABEL, BUCKET_VAR } from '@/lib/expenses/types'
import type { CategoryOption, ExpenseBucket, VehicleOption } from '@/lib/expenses/types'
import { formatAmount, parseAmount, parsedAmountHint } from '@/lib/money'

/** Long enough that typing a word is one navigation, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250

type LedgerFiltersBarProps = {
  filters: LedgerFilters
  categories: readonly CategoryOption[]
  icons: Record<string, ReactNode>
  vehicles: readonly VehicleOption[]
  currency: string
  locale: string
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

export function LedgerFiltersBar({
  filters,
  categories,
  icons,
  vehicles,
  currency,
  locale,
}: LedgerFiltersBarProps) {
  const router = useRouter()
  const pathname = usePathname()

  const [search, setSearch] = useState(filters.search)
  const [open, setOpen] = useState(false)
  const applied = useRef(filters.search)

  function navigate(next: LedgerFilters, mode: 'push' | 'replace') {
    applied.current = next.search
    const query = filtersToSearchParams(next).toString()
    const href = query ? `${pathname}?${query}` : pathname
    if (mode === 'push') router.push(href)
    else router.replace(href)
  }

  // Search runs as you type. It replaces rather than pushes, so backing out of
  // the ledger does not walk letter by letter through what was typed.
  useEffect(() => {
    if (search === applied.current) return
    const timer = setTimeout(() => {
      navigate({ ...filters, search }, 'replace')
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // `filters` is the applied state; re-running on it would fight the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const count = activeFilterCount(filters)

  return (
    <div className="mb-4 flex items-center gap-2">
      <label className="sr-only" htmlFor="ledger-search">
        Search notes and merchants
      </label>
      <input
        id="ledger-search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search notes and merchants"
        className={INPUT_CLASS}
      />
      <Button onClick={() => setOpen(true)} className="shrink-0">
        {count > 0 ? `Filters (${count})` : 'Filters'}
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
        {/* Mounted only while open, so the draft starts from the applied
            filters without an effect syncing the two. */}
        {open ? (
          <FilterSheetBody
            filters={filters}
            categories={categories}
            icons={icons}
            vehicles={vehicles}
            currency={currency}
            locale={locale}
            onApply={(next) => {
              setOpen(false)
              setSearch(next.search)
              navigate(next, 'push')
            }}
          />
        ) : null}
      </Sheet>
    </div>
  )
}

type FilterSheetBodyProps = {
  filters: LedgerFilters
  categories: readonly CategoryOption[]
  icons: Record<string, ReactNode>
  vehicles: readonly VehicleOption[]
  currency: string
  locale: string
  onApply: (filters: LedgerFilters) => void
}

function FilterSheetBody({
  filters,
  categories,
  icons,
  vehicles,
  currency,
  locale,
  onApply,
}: FilterSheetBodyProps) {
  const [draft, setDraft] = useState<LedgerFilters>(filters)
  const [minText, setMinText] = useState(() =>
    filters.amountMin === null ? '' : formatAmount(filters.amountMin, currency, { locale }),
  )
  const [maxText, setMaxText] = useState(() =>
    filters.amountMax === null ? '' : formatAmount(filters.amountMax, currency, { locale }),
  )

  const patch = (part: Partial<LedgerFilters>) => setDraft((previous) => ({ ...previous, ...part }))

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="filter-from">
            <input
              id="filter-from"
              type="date"
              className={`${INPUT_CLASS} font-mono`}
              value={draft.from ?? ''}
              onChange={(event) => patch({ from: event.target.value || null })}
            />
          </Field>
          <Field label="To" htmlFor="filter-to">
            <input
              id="filter-to"
              type="date"
              className={`${INPUT_CLASS} font-mono`}
              value={draft.to ?? ''}
              onChange={(event) => patch({ to: event.target.value || null })}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-label text-ink-muted">Bucket</p>
          <div className="flex flex-wrap gap-2">
            {BUCKETS.map((bucket: ExpenseBucket) => (
              <Chip
                key={bucket}
                selected={draft.buckets.includes(bucket)}
                accent={BUCKET_VAR[bucket]}
                onSelect={() => patch({ buckets: toggle(draft.buckets, bucket) })}
              >
                {BUCKET_LABEL[bucket]}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-label text-ink-muted">Category</p>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Chip
                key={category.id}
                selected={draft.categoryIds.includes(category.id)}
                accent={category.colour_hex}
                onSelect={() => patch({ categoryIds: toggle(draft.categoryIds, category.id) })}
              >
                {icons[category.icon] ?? null}
                {category.name}
              </Chip>
            ))}
          </div>
        </div>

        {vehicles.length > 0 ? (
          <div className="space-y-2">
            <p className="text-label text-ink-muted">Vehicle</p>
            <div className="flex flex-wrap gap-2">
              {vehicles.map((vehicle) => (
                <Chip
                  key={vehicle.id}
                  selected={draft.vehicleIds.includes(vehicle.id)}
                  accent={vehicle.colour_hex ?? undefined}
                  onSelect={() => patch({ vehicleIds: toggle(draft.vehicleIds, vehicle.id) })}
                >
                  {vehicle.nickname}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-label text-ink-muted">Photos</p>
          <div className="flex flex-wrap gap-2">
            <Chip selected={draft.hasPhoto === null} onSelect={() => patch({ hasPhoto: null })}>
              Any
            </Chip>
            <Chip selected={draft.hasPhoto === true} onSelect={() => patch({ hasPhoto: true })}>
              With a photo
            </Chip>
            <Chip selected={draft.hasPhoto === false} onSelect={() => patch({ hasPhoto: false })}>
              Without
            </Chip>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Amount from"
            htmlFor="filter-min"
            hint={parsedAmountHint(minText, currency, locale) ?? undefined}
          >
            <AmountInput
              id="filter-min"
              currency={currency}
              locale={locale}
              value={minText}
              onValueChange={(text) => {
                setMinText(text)
                patch({ amountMin: parseAmount(text, currency) })
              }}
            />
          </Field>
          <Field
            label="Amount to"
            htmlFor="filter-max"
            hint={parsedAmountHint(maxText, currency, locale) ?? undefined}
          >
            <AmountInput
              id="filter-max"
              currency={currency}
              locale={locale}
              value={maxText}
              onValueChange={(text) => {
                setMaxText(text)
                patch({ amountMax: parseAmount(text, currency) })
              }}
            />
          </Field>
        </div>
      </div>

      <div
        className="flex gap-3 border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Button onClick={() => onApply(EMPTY_FILTERS)} className="flex-1">
          Clear all
        </Button>
        <Button variant="primary" onClick={() => onApply(draft)} className="flex-1">
          Show results
        </Button>
      </div>
    </>
  )
}

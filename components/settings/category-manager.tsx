// The whole screen is edit state: a list, a sheet, and writes in flight.
'use client'

import { startTransition, useMemo, useOptimistic, useState, type ReactNode } from 'react'

import {
  createCategoryAction,
  setCategoryArchivedAction,
  updateCategoryAction,
} from '@/app/(app)/settings/categories/actions'
import { ColourPicker } from '@/components/ui/colour-picker'
import { IconPicker } from '@/components/settings/icon-picker'
import { FALLBACK_ICON_NAME } from '@/components/icons/catalog-names'
import { Button } from '@/components/ui/button'
import { BudgetImpactSwitch } from '@/components/expenses/budget-impact-switch'
import { BucketChips } from '@/components/expenses/bucket-chips'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'
import { todayIso } from '@/lib/dates'
import type { CategoryWrite } from '@/lib/expenses/schema'
import { BUCKET_LABEL, type CategoryOption, type ExpenseBucket } from '@/lib/expenses/types'

type Draft = {
  id: string
  name: string
  icon: string
  colour_hex: string
  default_bucket: ExpenseBucket
  default_counts_toward_budget: boolean
  sort_order: number | null
  isNew: boolean
  isSystem: boolean
}

/** Stable empty base: a new array each render would restart the reducer. */
const NO_CHANGES: Change[] = []

type Change =
  | { kind: 'save'; category: CategoryOption }
  | { kind: 'archive'; id: string; archived: boolean }

function blankDraft(): Draft {
  return {
    id: crypto.randomUUID(),
    name: '',
    icon: FALLBACK_ICON_NAME,
    colour_hex: '#578769',
    default_bucket: 'life',
    default_counts_toward_budget: true,
    sort_order: null,
    isNew: true,
    isSystem: false,
  }
}

function toDraft(category: CategoryOption): Draft {
  return {
    id: category.id,
    name: category.name,
    icon: category.icon,
    colour_hex: category.colour_hex,
    default_bucket: category.default_bucket,
    default_counts_toward_budget: category.default_counts_toward_budget,
    sort_order: category.sort_order,
    isNew: false,
    isSystem: category.is_system,
  }
}

function draftToCategory(draft: Draft, previous: CategoryOption | undefined): CategoryOption {
  return {
    id: draft.id,
    name: draft.name.trim(),
    icon: draft.icon,
    colour_hex: draft.colour_hex,
    default_bucket: draft.default_bucket,
    default_counts_toward_budget: draft.default_counts_toward_budget,
    is_system: draft.isSystem,
    archived_at: previous?.archived_at ?? null,
    sort_order: draft.sort_order,
    uses_recent: previous?.uses_recent ?? 0,
    uses_all: previous?.uses_all ?? 0,
    last_used_on: previous?.last_used_on ?? null,
  }
}

function applyChanges(categories: CategoryOption[], changes: Change[]): CategoryOption[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  for (const change of changes) {
    if (change.kind === 'save') {
      byId.set(change.category.id, change.category)
      continue
    }
    const existing = byId.get(change.id)
    if (existing) {
      byId.set(change.id, {
        ...existing,
        archived_at: change.archived ? new Date().toISOString() : null,
      })
    }
  }
  return [...byId.values()]
}

/**
 * Categories, in Settings: create, rename, recolour, re-icon, set the two
 * defaults, archive.
 *
 * The two defaults are the same controls the expense form uses, on purpose —
 * whatever a category says here is exactly what an expense picking it starts
 * from, and seeing them in the same shape is what makes that obvious.
 */
type CategoryManagerProps = {
  categories: CategoryOption[]
  /** The whole icon catalogue, drawn on the server. See catalog.tsx. */
  icons: Record<string, ReactNode>
}

export function CategoryManager({ categories, icons }: CategoryManagerProps) {
  const { show } = useToast()
  const [changes, addChange] = useOptimistic<Change[], Change>(NO_CHANGES, (queue, change) => [
    ...queue,
    change,
  ])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const current = useMemo(
    () =>
      applyChanges(categories, changes).sort((a, b) => {
        const left = a.sort_order ?? Number.MAX_SAFE_INTEGER
        const right = b.sort_order ?? Number.MAX_SAFE_INTEGER
        return left === right ? a.name.localeCompare(b.name) : left - right
      }),
    [categories, changes],
  )
  const live = current.filter((category) => category.archived_at === null)
  const archived = current.filter((category) => category.archived_at !== null)

  function setArchived(category: CategoryOption, archivedNext: boolean) {
    startTransition(async () => {
      addChange({ kind: 'archive', id: category.id, archived: archivedNext })
      const result = await setCategoryArchivedAction({ id: category.id, archived: archivedNext })
      if (!result.ok) {
        show(result.error)
        return
      }
      if (archivedNext) {
        show(`${category.name} archived`, {
          label: 'Undo',
          run: () => setArchived(category, false),
        })
      }
    })
  }

  function save() {
    if (!draft) return
    setError(null)

    // The server action parses this with `categoryWriteSchema`; the check here
    // is only so an empty name is caught without a round trip. zod itself stays
    // out of the client bundle — see AUTOPILOT-NOTES.md.
    if (draft.name.trim() === '') {
      setError('Name the category')
      return
    }

    const write: CategoryWrite = {
      id: draft.id,
      name: draft.name.trim(),
      icon: draft.icon,
      colour_hex: draft.colour_hex.toUpperCase(),
      default_bucket: draft.default_bucket,
      default_counts_toward_budget: draft.default_counts_toward_budget,
      sort_order: draft.sort_order,
    }

    const previous = categories.find((category) => category.id === draft.id)
    const optimistic = draftToCategory(draft, previous)
    const isNew = draft.isNew
    setDraft(null)

    startTransition(async () => {
      addChange({ kind: 'save', category: optimistic })
      const result = isNew ? await createCategoryAction(write) : await updateCategoryAction(write)
      if (!result.ok) show(result.error)
    })
  }

  return (
    <div className="space-y-6">
      <Button variant="primary" onClick={() => setDraft(blankDraft())} className="w-full">
        New category
      </Button>

      <CategoryTable
        heading="In use"
        categories={live}
        icons={icons}
        onEdit={(category) => setDraft(toDraft(category))}
        onArchive={(category) => setArchived(category, true)}
      />

      {archived.length > 0 ? (
        <CategoryTable
          heading="Archived"
          categories={archived}
          icons={icons}
          onEdit={(category) => setDraft(toDraft(category))}
          onRestore={(category) => setArchived(category, false)}
        />
      ) : null}

      <Sheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.isNew ? 'New category' : 'Edit category'}
      >
        {draft ? (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-4 py-4">
              <Field label="Name" htmlFor="category-name" error={error}>
                <input
                  id="category-name"
                  className={INPUT_CLASS}
                  value={draft.name}
                  autoComplete="off"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </Field>

              <div className="space-y-2">
                <p className="text-label text-ink-muted">Colour</p>
                <ColourPicker
                  value={draft.colour_hex}
                  onChange={(hex) => setDraft({ ...draft, colour_hex: hex })}
                />
              </div>

              <div className="space-y-2">
                <p className="text-label text-ink-muted">Default bucket</p>
                <BucketChips
                  value={draft.default_bucket}
                  onChange={(bucket) => setDraft({ ...draft, default_bucket: bucket })}
                  vehicleAttached={false}
                  canAttachVehicle
                  coupled={false}
                />
                <p className="text-caption text-ink-muted">
                  An expense in this category starts as {BUCKET_LABEL[draft.default_bucket].toLowerCase()}{' '}
                  spend. It can still be moved one expense at a time.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-label text-ink-muted">Default budget impact</p>
                <BudgetImpactSwitch
                  checked={draft.default_counts_toward_budget}
                  occurredOn={todayIso()}
                  onChange={(counts) =>
                    setDraft({ ...draft, default_counts_toward_budget: counts })
                  }
                />
              </div>

              <div className="space-y-2">
                <p className="text-label text-ink-muted">Icon</p>
                <IconPicker
                  value={draft.icon}
                  colour={draft.colour_hex}
                  icons={icons}
                  onChange={(icon) => setDraft({ ...draft, icon })}
                />
              </div>
            </div>

            <div
              className="border-t border-border bg-surface px-4 py-3"
              style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
            >
              <Button variant="primary" onClick={save} className="w-full">
                {draft.isNew ? 'Create category' : 'Save changes'}
              </Button>
            </div>
          </>
        ) : null}
      </Sheet>
    </div>
  )
}

type CategoryTableProps = {
  heading: string
  categories: CategoryOption[]
  icons: Record<string, ReactNode>
  onEdit: (category: CategoryOption) => void
  onArchive?: (category: CategoryOption) => void
  onRestore?: (category: CategoryOption) => void
}

function CategoryTable({
  heading,
  categories,
  icons,
  onEdit,
  onArchive,
  onRestore,
}: CategoryTableProps) {
  if (categories.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="text-eyebrow font-display uppercase text-ink-muted">{heading}</h2>
      <ul className="overflow-hidden rounded-md border border-border bg-surface">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center gap-3 border-b border-border px-3 last:border-b-0">
            <button
              type="button"
              onClick={() => onEdit(category)}
              className="flex min-h-touch flex-1 items-center gap-3 py-2 text-left"
            >
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full"
                style={{ color: category.colour_hex, backgroundColor: 'var(--surface-sunken)' }}
              >
                {icons[category.icon] ?? null}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-body text-ink">{category.name}</span>
                <span className="block truncate text-caption text-ink-muted">
                  {BUCKET_LABEL[category.default_bucket]} ·{' '}
                  {category.default_counts_toward_budget ? 'counts' : 'kept out'} ·{' '}
                  {category.uses_all} {category.uses_all === 1 ? 'use' : 'uses'}
                </span>
              </span>
            </button>
            {onArchive ? (
              <button
                type="button"
                onClick={() => onArchive(category)}
                className="min-h-touch shrink-0 px-2 text-label text-ink-muted"
              >
                Archive
              </button>
            ) : null}
            {onRestore ? (
              <button
                type="button"
                onClick={() => onRestore(category)}
                className="min-h-touch shrink-0 px-2 text-label text-accent"
              >
                Restore
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

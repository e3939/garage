import type { ExpenseFormValues } from '@/components/expenses/expense-form'

/**
 * What has been typed into the quick-add sheet, kept where a dropped connection
 * cannot reach it.
 *
 * The failure this exists for is specific and it is the one a phone on a train
 * actually produces: you type an amount, tap Save, the sheet closes because the
 * write is optimistic, the request never lands, and the toast that says so is
 * the only trace left of what you typed. The Retry in that toast covers the
 * common case — the closure still holds the write — but a closure does not
 * survive a reload, and the tab going away is exactly what happens next when a
 * phone gives up on a page.
 *
 * So the draft is written to `localStorage` as it is typed and cleared by the
 * *server's* confirmation rather than by the form closing. Anything that ends
 * with the expense not saved leaves the draft behind, and the next time the
 * sheet opens it opens on it.
 *
 * Only the create path. An edit already has a row on the server to fall back on,
 * and restoring a half-typed edit over a real expense is a worse failure than
 * losing it.
 */
const KEY = 'garage:expense-draft'

/**
 * A draft older than this is somebody else's afternoon. Long enough to survive a
 * dead battery, short enough that a sheet does not open on a number from last
 * month.
 */
const MAX_AGE_MS = 1000 * 60 * 60 * 24

type StoredDraft = {
  at: number
  values: ExpenseFormValues
}

/** Never throws. A full or disabled localStorage must not take the form down. */
export function readExpenseDraft(): ExpenseFormValues | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null

    const stored = JSON.parse(raw) as Partial<StoredDraft>
    if (typeof stored.at !== 'number' || !stored.values) return null
    if (Date.now() - stored.at > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY)
      return null
    }

    // An amount is what makes a draft worth restoring. Everything else is
    // context around a number nobody typed.
    if (typeof stored.values.amountText !== 'string' || stored.values.amountText.trim() === '') {
      return null
    }

    return stored.values
  } catch {
    return null
  }
}

export function writeExpenseDraft(values: ExpenseFormValues): void {
  try {
    if (values.amountText.trim() === '') {
      window.localStorage.removeItem(KEY)
      return
    }
    window.localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), values } satisfies StoredDraft))
  } catch {
    // Private mode, or a full quota. The form still works; it just forgets.
  }
}

export function clearExpenseDraft(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // As above.
  }
}

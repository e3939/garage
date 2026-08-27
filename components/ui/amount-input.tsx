// The caret has to be read and written on a real DOM node, and that only
// happens in the browser.
'use client'

import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react'

import { INPUT_CLASS } from '@/components/ui/field'
import { amountCaret, amountSeparators, formatAmountInput, type CurrencyCode } from '@/lib/money'

type AmountInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  /**
   * Forwarded on, so a form can still focus the field. A callback rather than a
   * ref object: react-hook-form's `register().ref` is one, the only other
   * caller wants one, and writing `.current` on a prop is a mutation after
   * render that the React Compiler refuses to memoise around.
   */
  inputRef?: (element: HTMLInputElement | null) => void
  /** The raw text the form holds. Grouped, because that is what is shown. */
  value: string
  /** Receives the text after grouping, so the form and the field never differ. */
  onValueChange: (text: string) => void
  currency: CurrencyCode
  locale: string
}

/**
 * The amount field, grouped as you type.
 *
 * Every money input in the app is this component, so the separator in a field
 * and the separator in the ledger next to it are the same character — both come
 * from `amountSeparators`, which reads it off the same `Intl` formatter
 * `formatMoney` uses.
 *
 * Three things make this harder than it looks, and all three are handled here
 * rather than in each form:
 *
 * **The caret.** Inserting a separator shifts everything to its right, so a
 * character index that was right before the edit points somewhere else after
 * it. The caret is tracked by counting digits to its left instead, which is
 * stable however many separators come and go. Without this, editing the middle
 * of a number is impossible: the caret jumps to the end on every keystroke.
 *
 * **Shorthand.** `150k` and `1.2m` are left completely alone by the formatter,
 * because grouping them would insert separators that `parseAmount` would then
 * have to read as grouping — and the dot in `1.2m` is a decimal point.
 *
 * **Backspace over a separator.** The browser deletes the separator, the
 * formatter puts it straight back, and the caret ends up parked on a character
 * that cannot be removed. So a Backspace whose left-hand neighbour is a
 * separator deletes the digit beyond it instead, and Delete does the mirror
 * image.
 *
 * `inputMode="decimal"` keeps the numeric keypad on iOS, and the class carries
 * the 16px floor from `docs/03-DESIGN.md` — under that, focusing the field
 * zooms the page and never zooms back.
 */
export function AmountInput({
  inputRef: forwarded,
  value,
  onValueChange,
  currency,
  locale,
  className,
  ...rest
}: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pendingCaret = useRef<number | null>(null)
  const { group } = amountSeparators(currency, locale)

  // After the value has rendered, not before: setting the caret against the
  // previous text would put it in the wrong place for one frame and, on iOS,
  // scroll the field.
  useLayoutEffect(() => {
    const node = inputRef.current
    const caret = pendingCaret.current
    if (node && caret !== null) {
      node.setSelectionRange(caret, caret)
      pendingCaret.current = null
    }
  })

  function commit(nextRaw: string, caretInRaw: number) {
    const formatted = formatAmountInput(nextRaw, currency, locale)
    pendingCaret.current = amountCaret(nextRaw, caretInRaw, formatted)
    onValueChange(formatted)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    rest.onKeyDown?.(event)
    if (event.defaultPrevented || group === '') return

    const node = event.currentTarget
    const start = node.selectionStart
    const end = node.selectionEnd
    // Only a collapsed caret. A selection is the browser's to delete.
    if (start === null || end === null || start !== end) return

    const current = node.value

    if (
      event.key === 'Backspace' &&
      start >= group.length + 1 &&
      current.slice(start - group.length, start) === group
    ) {
      event.preventDefault()
      const separatorAt = start - group.length
      commit(current.slice(0, separatorAt - 1) + current.slice(start), separatorAt - 1)
      return
    }

    if (event.key === 'Delete' && current.slice(start, start + group.length) === group) {
      event.preventDefault()
      const afterSeparator = start + group.length
      commit(current.slice(0, start) + current.slice(afterSeparator + 1), start)
    }
  }

  return (
    <input
      {...rest}
      ref={(element) => {
        inputRef.current = element
        forwarded?.(element)
      }}
      type="text"
      inputMode="decimal"
      autoComplete={rest.autoComplete ?? 'off'}
      value={value}
      onChange={(event) => {
        const node = event.target
        commit(node.value, node.selectionStart ?? node.value.length)
      }}
      onKeyDown={handleKeyDown}
      className={className ?? `${INPUT_CLASS} font-mono`}
    />
  )
}

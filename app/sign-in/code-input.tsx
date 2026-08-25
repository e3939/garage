// Digit boxes, focus and paste are all client behaviour.
'use client'

import { useEffect, useRef, useState } from 'react'

type CodeInputProps = {
  id: string
  name: string
  length: number
  disabled?: boolean
  invalid?: boolean
  /** Fires once per distinct complete code. */
  onComplete: (code: string) => void
}

/**
 * One real input, `length` painted boxes.
 *
 * Six separate inputs is the obvious build and it is the wrong one on a phone:
 * iOS hands the whole code from the SMS/mail notification to a single field
 * with `autocomplete="one-time-code"`, so with six fields the code lands in box
 * one and the rest stay empty. A paste behaves the same way, and moving focus
 * between six fields on a soft keyboard invites its own bugs.
 *
 * So the input is one field stretched over the boxes at zero opacity. Autofill,
 * paste, backspace, the caret and select-all are the browser's own; the boxes
 * are presentational and marked aria-hidden. Screen readers get one labelled
 * field, which is also less to hear than six.
 *
 * To clear it, remount it: the caller gives it a `key` that changes per code
 * sent and per failed attempt.
 */
export function CodeInput({
  id,
  name,
  length,
  disabled,
  invalid,
  onComplete,
}: CodeInputProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const completed = useRef<string | null>(null)

  // Focus on mount, which is also every reset: the caller remounts this
  // component rather than reaching in to clear it.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, length)
    setValue(digits)

    // Guard on the value, not on length: re-entering the same code after a
    // rejection has to submit again, but a stray change event must not.
    if (digits.length === length && completed.current !== digits) {
      completed.current = digits
      onComplete(digits)
    } else if (digits.length < length) {
      completed.current = null
    }
  }

  const cells = Array.from({ length }, (_, index) => value[index] ?? '')
  const activeIndex = Math.min(value.length, length - 1)

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        // iOS reads the attribute; the pattern keeps a desktop browser from
        // offering an unrelated saved value.
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        required
        aria-label={`${length}-digit code`}
        aria-invalid={invalid || undefined}
        className="absolute inset-0 z-10 h-full w-full rounded-md bg-transparent text-input text-transparent caret-transparent outline-none"
      />

      <div aria-hidden className="flex gap-2">
        {cells.map((digit, index) => {
          const isActive = focused && index === activeIndex
          return (
            <div
              key={index}
              className={[
                'flex h-touch flex-1 items-center justify-center rounded-md border',
                'bg-surface font-mono text-odometer text-ink',
                'transition-colors duration-state ease-enter',
                invalid ? 'border-critical' : 'border-border-strong',
                isActive ? 'outline outline-2 outline-offset-2 outline-positive' : '',
              ].join(' ')}
            >
              {digit}
            </div>
          )
        })}
      </div>
    </div>
  )
}

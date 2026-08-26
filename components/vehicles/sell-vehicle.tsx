// The sale is two fields and a confirmation, so it holds its own state rather
// than going through react-hook-form: a form library for a date and a price
// would be seventy kilobytes to save twenty lines.
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'

import { sellVehicleAction, unsellVehicleAction } from '@/app/(app)/garage/actions'
import { Button } from '@/components/ui/button'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { isIsoDate, type IsoDate } from '@/lib/dates'
import { formatAmount, formatMoney, parseAmount, parsedAmountHint } from '@/lib/money'

type SellVehicleProps = {
  vehicleId: string
  nickname: string
  sold: boolean
  soldDate: IsoDate | null
  /** Formatted on the server: `date-fns` costs 8KB in a client bundle. */
  soldDateLabel: string | null
  soldPrice: number | null
  currency: string
  locale: string
  today: IsoDate
}

/**
 * Selling a car does not delete it (docs/01-PRODUCT.md, section B): "It archives
 * into a closed chapter with a final summary."
 *
 * So this writes a date, a price and a status, and then goes straight to that
 * summary — the page is the point of the flow, not a receipt for it. Coming back
 * is one tap, because a mistyped date on the day you sell a car you have owned
 * for four years is a thing that happens.
 */
export function SellVehicle({
  vehicleId,
  nickname,
  sold,
  soldDate,
  soldDateLabel,
  soldPrice,
  currency,
  locale,
  today,
}: SellVehicleProps) {
  const router = useRouter()
  const { show } = useToast()
  const [pending, startTransition] = useTransition()

  const [open, setOpen] = useState(false)
  const [date, setDate] = useState<string>(soldDate ?? today)
  const [priceText, setPriceText] = useState<string>(
    soldPrice === null ? '' : formatAmount(soldPrice, currency, { locale }),
  )
  const [error, setError] = useState<string | null>(null)

  const priceHint = parsedAmountHint(priceText, currency, locale)

  function sell() {
    setError(null)

    if (!isIsoDate(date)) {
      setError('Pick the date it was sold')
      return
    }

    const price = priceText.trim() === '' ? null : parseAmount(priceText, currency)
    if (priceText.trim() !== '' && price === null) {
      setError('That price could not be read')
      return
    }

    startTransition(async () => {
      const result = await sellVehicleAction({
        id: vehicleId,
        sold_date: date,
        sold_price: price,
        currency,
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      router.refresh()
      router.push(`/garage/${vehicleId}/sold` as Route)
    })
  }

  function unsell() {
    startTransition(async () => {
      const result = await unsellVehicleAction(vehicleId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
      show(`${nickname} is back in the garage`)
    })
  }

  if (sold) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-surface p-4">
        <h2 className="text-label text-ink">Sold</h2>
        <p className="text-body text-ink-muted">
          {nickname} left on {soldDateLabel ?? soldDate}
          {soldPrice === null ? '' : ` for ${formatMoney(soldPrice, currency, { locale })}`}. Its
          log is intact and its closing summary is still there.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push(`/garage/${vehicleId}/sold` as Route)}>
            Closing summary
          </Button>
          <Button variant="ghost" disabled={pending} onClick={unsell}>
            Put it back in the garage
          </Button>
        </div>
        {error ? <p className="text-caption text-critical">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      {open ? (
        <>
          <h2 className="text-label text-ink">Sell {nickname}</h2>

          <Field label="Date sold" htmlFor="sold-date">
            <input
              id="sold-date"
              type="date"
              className={INPUT_CLASS}
              value={date}
              max={today}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>

          <Field
            label="Sale price"
            htmlFor="sold-price"
            hint={priceHint ?? 'Leave it blank if you would rather not record one.'}
          >
            <input
              id="sold-price"
              inputMode="decimal"
              autoComplete="off"
              className={`${INPUT_CLASS} font-mono`}
              value={priceText}
              onChange={(event) => setPriceText(event.target.value)}
            />
          </Field>

          {error ? <p className="text-caption text-critical">{error}</p> : null}

          <p className="text-caption text-ink-muted">
            The car leaves the garage and every expense it earned stays where it is. You will get
            the closing summary next.
          </p>

          <div className="flex gap-2">
            <Button variant="primary" disabled={pending} onClick={sell}>
              Mark sold
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Not yet
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-body text-ink-muted">
            Sold it? Record the date and what it went for, and close the chapter properly.
          </p>
          <Button onClick={() => setOpen(true)}>Mark as sold</Button>
        </>
      )}
    </div>
  )
}

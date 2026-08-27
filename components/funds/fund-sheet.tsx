// A form: a name, a target, a rate, and what it is for.
'use client'

import { useState } from 'react'

import {
  createFundAction,
  deleteFundAction,
  setFundClosedAction,
  updateFundAction,
} from '@/app/(app)/funds/actions'
import { AmountInput } from '@/components/ui/amount-input'
import { Button } from '@/components/ui/button'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { Money } from '@/components/ui/money'
import { useToast } from '@/components/ui/toast'
import { undoFor } from '@/components/ui/undo'
import type { FundWrite } from '@/lib/funds/schema'
import type { FundStatus } from '@/lib/funds/types'
import { projectFund } from '@/lib/funds/projection'
import type { IsoDate } from '@/lib/dates'
import { formatAmount, parseAmount, parsedAmountHint } from '@/lib/money'

export type FundVehicleOption = { id: string; nickname: string }
export type FundModOption = { id: string; title: string; vehicle_id: string }

export type FundSheetProps = {
  mode: 'create' | 'edit'
  initial?: FundStatus | null
  vehicles: readonly FundVehicleOption[]
  mods: readonly FundModOption[]
  currency: string
  locale: string
  today: IsoDate
  /**
   * Month names for the projection sentence, keyed by month start. Turning a
   * date into words needs a locale's worth of month names; they are formatted on
   * the server and handed in, the same way icons are. See `lib/dates-display.ts`.
   */
  monthLabels: Readonly<Record<string, string>>
  onDone: () => void
}

/**
 * A sinking fund.
 *
 * docs/01-PRODUCT.md, section G: "Set a target and a monthly contribution;
 * contributions are recorded (manually — this app does not touch a bank). Shows
 * progress and projected completion date."
 *
 * The projected date is shown here, live, while the target and the rate are
 * still being typed, because that number is the entire reason a person sets a
 * fund up. It comes from `lib/funds/projection.ts`, which mirrors the arithmetic
 * in `v_fund_status`; the view is what the list reads afterwards.
 *
 * Linking a mod is what lets the mark-installed flow draw the fund down without
 * anybody having to remember to. The list of mods is filtered by the chosen car,
 * so a fund cannot end up pointing at a mod on a different one.
 */
export function FundSheet({
  mode,
  initial,
  vehicles,
  mods,
  currency,
  locale,
  today,
  monthLabels,
  onDone,
}: FundSheetProps) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(initial?.name ?? '')
  const [targetText, setTargetText] = useState(
    initial ? formatAmount(initial.target_amount, currency, { locale }) : '',
  )
  const [rateText, setRateText] = useState(
    initial?.monthly_contribution == null
      ? ''
      : formatAmount(initial.monthly_contribution, currency, { locale }),
  )
  const [vehicleId, setVehicleId] = useState(initial?.vehicle_id ?? '')
  const [modId, setModId] = useState(initial?.mod_plan_id ?? '')

  const target = parseAmount(targetText, currency)
  const rate = parseAmount(rateText, currency)
  const balance = initial?.balance ?? 0

  const projection =
    target === null
      ? null
      : projectFund({ target, balance, monthlyContribution: rate, from: today })

  const eligibleMods = vehicleId === '' ? [] : mods.filter((mod) => mod.vehicle_id === vehicleId)

  async function save() {
    setError(null)

    if (name.trim() === '') {
      setError('Name the fund')
      return
    }
    if (target === null || target <= 0) {
      setError('Set a target worth saving for')
      return
    }

    const write: FundWrite = {
      id: initial?.fund_id ?? crypto.randomUUID(),
      name: name.trim(),
      vehicle_id: vehicleId === '' ? null : vehicleId,
      // A mod on a car that is no longer selected is not a link anybody chose.
      mod_plan_id: modId === '' || vehicleId === '' ? null : modId,
      target_amount: target,
      monthly_contribution: rate,
      currency,
    }

    setSaving(true)
    const result = mode === 'create' ? await createFundAction(write) : await updateFundAction(write)
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    onDone()
  }

  async function close() {
    if (!initial) return
    const { fund_id: id, name: label } = initial
    setSaving(true)
    const result = await setFundClosedAction({ id, closed: true })
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    onDone()
    toast.show(`${label} closed`, {
      label: 'Undo',
      run: () => {
        void setFundClosedAction({ id, closed: false })
      },
    })
  }

  async function remove() {
    if (!initial) return
    const { fund_id: id, name: label } = initial
    setSaving(true)
    const result = await deleteFundAction(id)
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    onDone()
    toast.show(`${label} deleted`, undoFor(result, toast.show))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <Field label="What it is for" htmlFor="fund-name" error={error}>
          <input
            id="fund-name"
            className={INPUT_CLASS}
            autoComplete="off"
            placeholder="Coilovers"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Target"
          htmlFor="fund-target"
          hint={parsedAmountHint(targetText, currency, locale) ?? 'What it will cost.'}
        >
          <AmountInput
            id="fund-target"
            placeholder="0"
            currency={currency}
            locale={locale}
            value={targetText}
            onValueChange={setTargetText}
          />
        </Field>

        <Field
          label="Every month"
          htmlFor="fund-rate"
          hint={
            parsedAmountHint(rateText, currency, locale) ??
            'Optional. Without it there is no projected date.'
          }
        >
          <AmountInput
            id="fund-rate"
            placeholder="0"
            currency={currency}
            locale={locale}
            value={rateText}
            onValueChange={setRateText}
          />
        </Field>

        {projection ? (
          <p className="rounded-md border border-border bg-surface-sunken p-3 text-caption text-ink-muted">
            <Projection
              projection={projection}
              rate={rate}
              currency={currency}
              locale={locale}
              monthLabels={monthLabels}
            />
          </p>
        ) : null}

        <Field label="Car" htmlFor="fund-vehicle" hint="Optional. Links the fund to a garage.">
          <select
            id="fund-vehicle"
            className={INPUT_CLASS}
            value={vehicleId}
            onChange={(event) => {
              setVehicleId(event.target.value)
              setModId('')
            }}
          >
            <option value="">No car</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.nickname}
              </option>
            ))}
          </select>
        </Field>

        {eligibleMods.length > 0 ? (
          <Field
            label="Mod"
            htmlFor="fund-mod"
            hint="Marking this mod installed offers to draw the fund down."
          >
            <select
              id="fund-mod"
              className={INPUT_CLASS}
              value={modId}
              onChange={(event) => setModId(event.target.value)}
            >
              <option value="">Not for one mod in particular</option>
              {eligibleMods.map((mod) => (
                <option key={mod.id} value={mod.id}>
                  {mod.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {mode === 'edit' && initial ? (
          <div className="space-y-2 border-t border-border pt-4">
            <Button variant="secondary" className="w-full" onClick={close} disabled={saving}>
              {initial.closed_at ? 'Reopen fund' : 'Close fund'}
            </Button>
            {initial.contribution_count === 0 ? (
              <Button variant="danger" className="w-full" onClick={remove} disabled={saving}>
                Delete fund
              </Button>
            ) : (
              <p className="text-caption text-ink-muted">
                {`${initial.contribution_count} contributions are logged against this fund, so it closes rather than deletes.`}
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div
        className="border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" className="w-full" onClick={save} disabled={saving}>
          {mode === 'create' ? 'Start the fund' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

/** "At 2.000.000 a month, funded by March 2027." Or why it cannot say. */
function Projection({
  projection,
  rate,
  currency,
  locale,
  monthLabels,
}: {
  projection: ReturnType<typeof projectFund>
  rate: number | null
  currency: string
  locale: string
  monthLabels: Readonly<Record<string, string>>
}) {
  if (projection.remaining === 0) return <>Already there.</>

  if (projection.projectedOn === null || rate === null) {
    return <>Set a monthly figure and this says when the fund lands.</>
  }

  const label = monthLabels[projection.projectedOn]

  return (
    <>
      {'At '}
      <Money amount={rate} currency={currency} locale={locale} size="label" className="text-ink" />
      {' a month, funded by '}
      {/* Beyond the range of months the server formatted — a decade out at a
          hundred dong a month. The count is still true and still useful. */}
      <span className="text-ink">{label ?? `${projection.monthsRemaining} months from now`}</span>
      {'.'}
    </>
  )
}

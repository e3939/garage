// Parsing money as you type, uploading a photo, and disclosure state.
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'

import { createVehicleAction, updateVehicleAction } from '@/app/(app)/garage/actions'
import { HeroPhotoField } from '@/components/vehicles/hero-photo-field'
import { Button } from '@/components/ui/button'
import { ColourPicker } from '@/components/ui/colour-picker'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { isIsoDate, type IsoDate } from '@/lib/dates'
import { formatAmount, parseAmount, parsedAmountHint } from '@/lib/money'
import type { VehicleWrite } from '@/lib/vehicles/schema'
import {
  FUEL_TYPES,
  FUEL_TYPE_LABEL,
  TRANSMISSIONS,
  TRANSMISSION_LABEL,
  type Vehicle,
} from '@/lib/vehicles/types'

/** A car with no colour chosen still gets one, so the chrome has something to
    hold. Brick is the app's accent and the safest default on paper. */
const DEFAULT_COLOUR = '#A95031'

type Values = {
  nickname: string
  make: string
  model: string
  year: string
  trim: string
  plate: string
  colourHex: string
  fuelType: string
  transmission: string
  purchaseDate: string
  purchasePriceText: string
  odometerKm: string
  purchaseOdometerKm: string
}

function defaults(vehicle: Vehicle | null, currency: string, locale: string): Values {
  if (!vehicle) {
    return {
      nickname: '',
      make: '',
      model: '',
      year: '',
      trim: '',
      plate: '',
      colourHex: DEFAULT_COLOUR,
      fuelType: '',
      transmission: '',
      purchaseDate: '',
      purchasePriceText: '',
      odometerKm: '',
      purchaseOdometerKm: '',
    }
  }

  return {
    nickname: vehicle.nickname,
    make: vehicle.make ?? '',
    model: vehicle.model ?? '',
    year: vehicle.year === null ? '' : String(vehicle.year),
    trim: vehicle.trim ?? '',
    plate: vehicle.plate ?? '',
    colourHex: vehicle.colour_hex ?? DEFAULT_COLOUR,
    fuelType: vehicle.fuel_type ?? '',
    transmission: vehicle.transmission ?? '',
    purchaseDate: vehicle.purchase_date ?? '',
    purchasePriceText:
      vehicle.purchase_price === null
        ? ''
        : formatAmount(vehicle.purchase_price, vehicle.currency ?? currency, { locale }),
    odometerKm: String(vehicle.odometer_km),
    purchaseOdometerKm: String(vehicle.purchase_odometer_km),
  }
}

export type VehicleFormProps = {
  mode: 'create' | 'edit'
  vehicle?: Vehicle | null
  /** A signed URL for the stored hero photo, when there is one. */
  heroUrl?: string | null
  /** The path prefix for uploads. The user's own id, not a secret. */
  userId: string
  currency: string
  locale: string
  /** First car in the garage: the copy changes, the form does not. */
  first?: boolean
}

/**
 * One form for creating and editing a vehicle, and the same form the first-run
 * flow uses.
 *
 * Only the nickname is required. Everything else is skippable and editable
 * later, because a car you have not yet decided the trim of is still a car, and
 * an onboarding flow that insists on twelve fields is an onboarding flow people
 * abandon. The specification is explicit about this and so is the form: the
 * three fields above the fold are the name, the colour and the photo, and the
 * rest is one disclosure away.
 *
 * The vehicle's id is generated here rather than by the database, so the hero
 * photo can be uploaded to its final path — {user_id}/{vehicle_id}/{uuid}.webp —
 * before the row exists.
 */
export function VehicleForm({
  mode,
  vehicle = null,
  heroUrl = null,
  userId,
  currency,
  locale,
  first = false,
}: VehicleFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(mode === 'edit')
  const [heroPath, setHeroPath] = useState<string | null>(vehicle?.hero_photo_path ?? null)
  const [vehicleId] = useState(() => vehicle?.id ?? crypto.randomUUID())

  const { register, handleSubmit, watch, setValue } = useForm<Values>({
    defaultValues: defaults(vehicle, currency, locale),
  })

  const values = watch()
  const priceHint = parsedAmountHint(values.purchasePriceText, currency, locale)

  const submit = handleSubmit((form) => {
    setFormError(null)

    if (form.nickname.trim() === '') {
      setFormError('Give it a name')
      return
    }

    const odometer = form.odometerKm.trim() === '' ? 0 : Number(form.odometerKm)
    if (!Number.isFinite(odometer) || odometer < 0) {
      setFormError('The odometer is a whole number of kilometres')
      return
    }

    // Left blank, the reading at purchase is the reading now: a car entered
    // today at 34.500 has driven nothing under this owner yet.
    const purchaseOdometer =
      form.purchaseOdometerKm.trim() === '' ? odometer : Number(form.purchaseOdometerKm)
    if (!Number.isFinite(purchaseOdometer) || purchaseOdometer < 0) {
      setFormError('The reading at purchase is a whole number of kilometres')
      return
    }
    if (purchaseOdometer > odometer) {
      setFormError('The reading at purchase cannot be higher than the current reading')
      return
    }

    const year = form.year.trim() === '' ? null : Number(form.year)
    if (year !== null && !Number.isInteger(year)) {
      setFormError('The year is four digits')
      return
    }

    const price =
      form.purchasePriceText.trim() === '' ? null : parseAmount(form.purchasePriceText, currency)
    if (form.purchasePriceText.trim() !== '' && price === null) {
      setFormError('That price could not be read')
      return
    }

    const purchaseDate = form.purchaseDate.trim()
    if (purchaseDate !== '' && !isIsoDate(purchaseDate)) {
      setFormError('Pick a purchase date')
      return
    }

    const trimmed = (value: string) => value.trim()

    const write: VehicleWrite = {
      id: vehicleId,
      nickname: form.nickname.trim(),
      make: trimmed(form.make) || null,
      model: trimmed(form.model) || null,
      year,
      trim: trimmed(form.trim) || null,
      plate: trimmed(form.plate) || null,
      colour_hex: form.colourHex || null,
      fuel_type: (trimmed(form.fuelType) || null) as VehicleWrite['fuel_type'],
      transmission: (trimmed(form.transmission) || null) as VehicleWrite['transmission'],
      purchase_date: (purchaseDate || null) as IsoDate | null,
      purchase_price: price,
      currency,
      odometer_km: Math.round(odometer),
      purchase_odometer_km: Math.round(purchaseOdometer),
      hero_photo_path: heroPath,
    }

    startTransition(async () => {
      const result =
        mode === 'create' ? await createVehicleAction(write) : await updateVehicleAction(write)

      if (!result.ok) {
        setFormError(result.error)
        return
      }

      router.push(`/garage/${vehicleId}`)
      router.refresh()
    })
  })

  return (
    <form onSubmit={submit} className="space-y-6">
      <Field
        label="Name"
        htmlFor="vehicle-nickname"
        hint="What you call it. Everything else is optional."
        error={formError}
      >
        <input
          id="vehicle-nickname"
          className={INPUT_CLASS}
          autoComplete="off"
          enterKeyHint="next"
          placeholder="Civic"
          {...register('nickname')}
        />
      </Field>

      <div className="space-y-2">
        <p className="text-label text-ink-muted" id="vehicle-colour-label">
          Colour
        </p>
        <div aria-labelledby="vehicle-colour-label">
          <ColourPicker
            value={values.colourHex}
            onChange={(hex) => setValue('colourHex', hex)}
          />
        </div>
      </div>

      <HeroPhotoField
        userId={userId}
        vehicleId={vehicleId}
        value={heroPath}
        initialUrl={heroUrl}
        onChange={setHeroPath}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Make" htmlFor="vehicle-make">
          <input
            id="vehicle-make"
            className={INPUT_CLASS}
            autoComplete="off"
            placeholder="Honda"
            {...register('make')}
          />
        </Field>
        <Field label="Model" htmlFor="vehicle-model">
          <input
            id="vehicle-model"
            className={INPUT_CLASS}
            autoComplete="off"
            placeholder="Civic"
            {...register('model')}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Year" htmlFor="vehicle-year">
          <input
            id="vehicle-year"
            type="number"
            inputMode="numeric"
            className={`${INPUT_CLASS} font-mono`}
            placeholder="2019"
            {...register('year')}
          />
        </Field>
        <Field
          label="Odometer"
          htmlFor="vehicle-odometer"
          hint="km, right now"
        >
          <input
            id="vehicle-odometer"
            type="number"
            inputMode="numeric"
            min={0}
            className={`${INPUT_CLASS} font-mono`}
            placeholder="0"
            {...register('odometerKm')}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Bought on" htmlFor="vehicle-purchase-date">
          <input
            id="vehicle-purchase-date"
            type="date"
            className={`${INPUT_CLASS} font-mono`}
            {...register('purchaseDate')}
          />
        </Field>
        <Field
          label="Bought for"
          htmlFor="vehicle-purchase-price"
          hint={priceHint ?? 'Type 620m if that is quicker.'}
        >
          <input
            id="vehicle-purchase-price"
            inputMode="decimal"
            autoComplete="off"
            className={`${INPUT_CLASS} font-mono`}
            placeholder="0"
            {...register('purchasePriceText')}
          />
        </Field>
      </div>

      <details
        className="rounded-md border border-border"
        open={moreOpen}
        onToggle={(event) => setMoreOpen(event.currentTarget.open)}
      >
        <summary className="min-h-touch cursor-pointer list-none px-3 py-3 text-label text-ink-muted marker:content-none">
          More
        </summary>

        <div className="space-y-5 border-t border-border px-3 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trim" htmlFor="vehicle-trim">
              <input
                id="vehicle-trim"
                className={INPUT_CLASS}
                autoComplete="off"
                placeholder="RS"
                {...register('trim')}
              />
            </Field>
            <Field label="Plate" htmlFor="vehicle-plate">
              <input
                id="vehicle-plate"
                className={INPUT_CLASS}
                autoComplete="off"
                {...register('plate')}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fuel" htmlFor="vehicle-fuel">
              <select id="vehicle-fuel" className={INPUT_CLASS} {...register('fuelType')}>
                <option value="">Not set</option>
                {FUEL_TYPES.map((entry) => (
                  <option key={entry} value={entry}>
                    {FUEL_TYPE_LABEL[entry]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Transmission" htmlFor="vehicle-transmission">
              <select
                id="vehicle-transmission"
                className={INPUT_CLASS}
                {...register('transmission')}
              >
                <option value="">Not set</option>
                {TRANSMISSIONS.map((entry) => (
                  <option key={entry} value={entry}>
                    {TRANSMISSION_LABEL[entry]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="Odometer at purchase"
            htmlFor="vehicle-purchase-odometer"
            hint="Where your kilometres are counted from. Blank means the reading above."
          >
            <input
              id="vehicle-purchase-odometer"
              type="number"
              inputMode="numeric"
              min={0}
              className={`${INPUT_CLASS} font-mono`}
              placeholder={values.odometerKm || '0'}
              {...register('purchaseOdometerKm')}
            />
          </Field>
        </div>
      </details>

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {mode === 'create' ? (first ? 'Add your car' : 'Add vehicle') : 'Save changes'}
      </Button>
    </form>
  )
}

// Confirmation state, a server action, and a toast that can undo it.
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { setVehicleArchivedAction } from '@/app/(app)/garage/actions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

type ArchiveVehicleProps = {
  vehicleId: string
  nickname: string
  archived: boolean
}

/**
 * There is no delete.
 *
 * Expenses point at a vehicle, and a car that stopped being yours did not stop
 * having cost you money — the log is the whole point of the app. Archiving takes
 * it out of the garage and out of the expense form and leaves every figure it
 * earned intact, which is what `archived_at` is for
 * (docs/02-DATA-MODEL.md: "soft delete where history matters").
 *
 * The confirmation is inline rather than a dialog, because the action is
 * reversible and the toast offers to reverse it.
 */
export function ArchiveVehicle({ vehicleId, nickname, archived }: ArchiveVehicleProps) {
  const router = useRouter()
  const { show } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  function setArchived(next: boolean) {
    startTransition(async () => {
      const result = await setVehicleArchivedAction({ id: vehicleId, archived: next })
      if (!result.ok) {
        show(result.error)
        return
      }

      setConfirming(false)
      router.refresh()

      if (next) {
        router.push('/garage')
        show(`${nickname} archived`, { label: 'Undo', run: () => setArchived(false) })
      } else {
        show(`${nickname} is back in the garage`)
      }
    })
  }

  if (archived) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-surface p-4">
        <p className="text-body text-ink">
          {nickname} is archived. It stays out of the garage and out of the expense form, and
          every expense already attached to it is untouched.
        </p>
        <Button disabled={pending} onClick={() => setArchived(false)}>
          Return to the garage
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface p-4">
      {confirming ? (
        <>
          <p className="text-body text-ink">
            Archive {nickname}? Its expenses stay exactly where they are and the figures it
            earned stay right. You can bring it back.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" disabled={pending} onClick={() => setArchived(true)}>
              Archive {nickname}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-body text-ink-muted">
            Sold it, or done with it? Archiving keeps the whole log and takes the car out of
            the garage.
          </p>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Archive vehicle
          </Button>
        </>
      )}
    </div>
  )
}

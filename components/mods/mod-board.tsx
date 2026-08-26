// Pointer-event dragging, optimistic writes and three sheets. All of it browser.
'use client'

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import { moveModsAction, setModArchivedAction } from '@/app/(app)/mods/actions'
import { ModCardView } from '@/components/mods/mod-card'
import { ModSheet } from '@/components/mods/mod-sheet'
import type { ModIcons } from '@/components/mods/mod-icons'
import type { ExpenseFormProps, ExpensePrefill } from '@/components/expenses/expense-form'
import { LazyExpenseForm } from '@/components/expenses/expense-form-lazy'
import { Gauge } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Fab } from '@/components/ui/fab'
import { Money } from '@/components/ui/money'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'
import type { IsoDate } from '@/lib/dates'
import type { FundOffer } from '@/lib/funds/types'
import { applyMove, columnsOf, insertionIndex, nudge, type ModMove } from '@/lib/mods/board'
import {
  BOARD_STATUSES,
  MOD_STATUS_DESCRIPTION,
  MOD_STATUS_LABEL,
  isBoardStatus,
  type BoardStatus,
  type ModBoard as Board,
  type ModCard,
} from '@/lib/mods/types'

/** How close to the edge of the track a finger has to be to make it scroll. */
const EDGE = 56
/** Pixels per frame of auto-scroll. Slow enough to aim, fast enough to arrive. */
const SPEED = 14

/**
 * `fund` is omitted alongside the rest: it is not a property of the page, it is
 * a property of the card being installed, so the board picks it per mod below.
 */
type ExpenseProps = Omit<ExpenseFormProps, 'mode' | 'initial' | 'onDone' | 'prefill' | 'fund'>

type ModBoardProps = {
  vehicleId: string
  board: Board
  icons: ModIcons
  locale: string
  today: IsoDate
  userId: string
  /** "25 Aug 2026" per card, formatted on the server. See `lib/dates-display.ts`. */
  targetLabels: Readonly<Record<string, string>>
  /** Everything the pre-filled expense form needs, fetched with the page. */
  expense: ExpenseProps
  /**
   * The open funds saved up for these mods, keyed by mod. A card with an entry
   * here opens its install form offering to pay out of that fund; a card
   * without one never mentions funds at all.
   */
  fundOffers: Readonly<Record<string, FundOffer>>
  /** The category a mod expense files under. Null if it has been deleted. */
  modCategoryId: string | null
}

/** Fixed for the length of one drag. */
type Grip = { id: string; pointerId: number; width: number; dx: number; dy: number }

/** Where the finger is. Separate, because it changes sixty times a second. */
type Ghost = { x: number; y: number }

type Target = { status: BoardStatus; index: number; top: number }

function sameTarget(a: Target | null, b: Target | null): boolean {
  if (a === null || b === null) return a === b
  return a.status === b.status && a.index === b.index && a.top === b.top
}

/**
 * The mod board.
 *
 * Five columns, one per status, laid out as a horizontally snapping carousel
 * rather than as a five-up grid: at 390px a five-column board gives each column
 * seventy pixels, which is not a card, it is a hint of one.
 *
 * Dragging is written by hand on pointer events, because the alternative was a
 * drag-and-drop dependency and this needed about a hundred lines. The handle
 * carries `touch-action: none`, so a drag that starts there is never mistaken
 * for a scroll, and pointer capture means the finger can leave the handle —
 * which it does immediately — without the drag ending.
 *
 * The card being dragged keeps its place in the layout at reduced opacity and a
 * copy of it follows the finger. Nothing reflows, so the geometry the drop is
 * measured against holds still and the target cannot oscillate between two
 * positions while the finger is not moving. Where it will land is drawn as an
 * ink rule between two cards.
 *
 * The drop is optimistic: the board redraws, then `mod_reorder` writes every row
 * whose position changed in one statement. If that fails the board goes back to
 * exactly what it was and says why.
 */
export function ModBoard({
  vehicleId,
  board,
  icons,
  locale,
  today,
  userId,
  targetLabels,
  expense,
  fundOffers,
  modCategoryId,
}: ModBoardProps) {
  const { show } = useToast()

  const [state, setState] = useState<{ seed: Board; cards: ModCard[] }>(() => ({
    seed: board,
    cards: board.cards,
  }))
  const [grip, setGrip] = useState<Grip | null>(null)
  const [ghost, setGhost] = useState<Ghost>({ x: 0, y: 0 })
  const [target, setTarget] = useState<Target | null>(null)
  const [editing, setEditing] = useState<ModCard | null>(null)
  const [creating, setCreating] = useState(false)
  const [installing, setInstalling] = useState<ModCard | null>(null)

  const trackRef = useRef<HTMLDivElement>(null)
  const pointer = useRef({ x: 0, y: 0 })

  // A fresh server board replaces whatever was on screen, the same way a fresh
  // ledger page does: anything held on top of stale data is a lie about rows the
  // server has since changed.
  if (state.seed !== board) setState({ seed: board, cards: board.cards })

  const cards = state.cards
  const columns = useMemo(() => columnsOf(cards), [cards])

  /**
   * The window listeners below fire outside React's render, so what they need
   * has to be readable at that moment rather than closed over at registration.
   */
  const live = useRef({ cards, target, today, vehicleId })
  useEffect(() => {
    live.current = { cards, target, today, vehicleId }
  })

  /** Where a pointer at (x, y) would drop the card, and where to draw the rule. */
  const locate = useCallback((x: number, y: number, dragId: string): Target | null => {
    const track = trackRef.current
    if (!track) return null

    let chosen: HTMLElement | null = null
    let nearest = Number.POSITIVE_INFINITY

    for (const element of track.querySelectorAll<HTMLElement>('[data-column]')) {
      const rect = element.getBoundingClientRect()
      const distance = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
      if (distance < nearest) {
        nearest = distance
        chosen = element
      }
    }

    const status = chosen?.dataset.column
    const list = chosen?.querySelector<HTMLElement>('[data-cards]')
    if (!chosen || !list || !isBoardStatus(status)) return null

    const cardEls = Array.from(list.querySelectorAll<HTMLElement>('[data-card]')).filter(
      (element) => element.dataset.card !== dragId,
    )
    const midpoints = cardEls.map((element) => {
      const rect = element.getBoundingClientRect()
      return rect.top + rect.height / 2
    })

    const index = insertionIndex(midpoints, y)
    const listRect = list.getBoundingClientRect()

    const before = cardEls[index - 1]
    const first = cardEls[0]
    const top =
      before !== undefined
        ? before.getBoundingClientRect().bottom - listRect.top + 4
        : first !== undefined
          ? first.getBoundingClientRect().top - listRect.top - 4
          : 0

    return { status, index, top }
  }, [])

  const persist = useCallback(
    (previous: readonly ModCard[], next: ModCard[], moves: ModMove[]) => {
      if (moves.length === 0) return
      setState((held) => ({ ...held, cards: next }))

      startTransition(async () => {
        const result = await moveModsAction({
          vehicle_id: live.current.vehicleId,
          today: live.current.today,
          moves,
        })
        if (!result.ok) {
          setState((held) => ({ ...held, cards: [...previous] }))
          show(result.error)
        }
      })
    },
    [show],
  )

  /**
   * The drag itself: window listeners plus one animation frame loop.
   *
   * They live on the window rather than on the handle because pointer capture
   * sends every move to the captured element and those events still bubble, and
   * because a card can be re-rendered mid-drag — a handler bound to the element
   * would go with it.
   */
  useEffect(() => {
    if (!grip) return

    let frame = 0

    function onMove(event: PointerEvent) {
      if (event.pointerId !== grip?.pointerId) return
      pointer.current = { x: event.clientX, y: event.clientY }
      setGhost({ x: event.clientX, y: event.clientY })
    }

    function onEnd(event: PointerEvent) {
      if (event.pointerId !== grip?.pointerId) return

      const landing = live.current.target
      const held = live.current.cards
      setGrip(null)
      setTarget(null)
      if (!grip || !landing) return

      const before = held.find((card) => card.id === grip.id)
      const result = applyMove(held, {
        id: grip.id,
        to: landing.status,
        index: landing.index,
        today: live.current.today,
      })
      persist(held, result.cards, result.moves)

      // Dropping a card in Installed is the other way of marking it installed, so
      // it does what the button does: opens the expense form with the estimate
      // already in it. Closing that sheet leaves the card where it landed.
      if (landing.status === 'installed' && before && before.status !== 'installed') {
        setInstalling(result.cards.find((card) => card.id === grip.id) ?? before)
      }
    }

    function step() {
      const track = trackRef.current
      if (track && grip) {
        const rect = track.getBoundingClientRect()
        const { x, y } = pointer.current

        if (x < rect.left + EDGE) track.scrollLeft -= SPEED
        else if (x > rect.right - EDGE) track.scrollLeft += SPEED

        if (y < 96) window.scrollBy(0, -SPEED)
        else if (y > window.innerHeight - 120) window.scrollBy(0, SPEED)

        const next = locate(x, y, grip.id)
        setTarget((previous) => (sameTarget(previous, next) ? previous : next))
      }
      frame = requestAnimationFrame(step)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    frame = requestAnimationFrame(step)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      cancelAnimationFrame(frame)
    }
  }, [grip, locate, persist])

  function grab(event: ReactPointerEvent<HTMLElement>, card: ModCard) {
    const handle = event.currentTarget
    const element = handle.closest('[data-card]')
    if (!(element instanceof HTMLElement)) return

    const rect = element.getBoundingClientRect()
    handle.setPointerCapture(event.pointerId)
    pointer.current = { x: event.clientX, y: event.clientY }

    setGhost({ x: event.clientX, y: event.clientY })
    setGrip({
      id: card.id,
      pointerId: event.pointerId,
      width: rect.width,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
    })
    setTarget(locate(event.clientX, event.clientY, card.id))
  }

  function handleKey(event: ReactKeyboardEvent<HTMLElement>, card: ModCard) {
    const direction =
      event.key === 'ArrowUp'
        ? 'up'
        : event.key === 'ArrowDown'
          ? 'down'
          : event.key === 'ArrowLeft'
            ? 'left'
            : event.key === 'ArrowRight'
              ? 'right'
              : null
    if (!direction) return

    event.preventDefault()
    const result = nudge(cards, card.id, direction, today)
    if (!result) return
    persist(cards, result.cards, result.moves)
  }

  function remove(card: ModCard) {
    setEditing(null)
    void setModArchivedAction({ id: card.id, archived: true }).then((result) => {
      if (!result.ok) {
        show(result.error)
        return
      }
      show(`${card.title} removed`, {
        label: 'Undo',
        run: () => {
          void setModArchivedAction({ id: card.id, archived: false })
        },
      })
    })
  }

  function install(card: ModCard) {
    setEditing(null)
    if (card.status === 'installed') {
      setInstalling(card)
      return
    }

    const result = applyMove(cards, {
      id: card.id,
      to: 'installed',
      index: columns.installed.length,
      today,
    })
    persist(cards, result.cards, result.moves)
    setInstalling(result.cards.find((entry) => entry.id === card.id) ?? card)
  }

  const dragged = grip ? cards.find((card) => card.id === grip.id) : null

  const installPrefill: ExpensePrefill | null = installing
    ? {
        amount: installing.estimate,
        categoryId: modCategoryId ?? '',
        vehicleId,
        bucket: 'car_project',
        occurredOn: today,
        modPlanId: installing.id,
      }
    : null

  return (
    <>
      {/* An empty board is five empty columns, which teaches nobody anything
          the column headings do not. The board comes back the moment there is
          one card to put on it. */}
      {cards.length === 0 ? (
        <EmptyState
          icon={Gauge}
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              Add a mod
            </Button>
          }
        >
          Nothing planned yet. Add the first thing you want to do to the car and it lands in
          Dreaming; drag it right as it gets closer to real.
        </EmptyState>
      ) : null}

      <div ref={trackRef} className={cards.length === 0 ? 'hidden' : 'board-track'}>
        {BOARD_STATUSES.map((status) => {
          const column = columns[status]
          const totals = board.totals[status]

          return (
            <section key={status} data-column={status} className="board-column">
              <header className="mb-2 space-y-1">
                <h2 className="flex items-baseline justify-between gap-2">
                  <span className="text-eyebrow font-display uppercase text-ink">
                    {MOD_STATUS_LABEL[status]}
                  </span>
                  <span className="font-mono text-caption text-ink-faint">{column.length}</span>
                </h2>
                <p className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-caption text-ink-faint">
                    {MOD_STATUS_DESCRIPTION[status]}
                  </span>
                  {totals.estimate_total > 0 ? (
                    <Money
                      amount={totals.estimate_total}
                      currency={board.currency}
                      locale={locale}
                      size="label"
                      className="shrink-0 text-ink-muted"
                    />
                  ) : null}
                </p>
              </header>

              <div data-cards={status} className="relative space-y-2">
                {column.map((card) => (
                  <ModCardView
                    key={card.id}
                    card={card}
                    icons={icons}
                    locale={locale}
                    targetLabel={targetLabels[card.id] ?? null}
                    dragging={grip?.id === card.id}
                    onOpen={() => setEditing(card)}
                    onGrab={(event) => grab(event, card)}
                    onHandleKey={(event) => handleKey(event, card)}
                  />
                ))}

                {column.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border-strong p-3 text-caption text-ink-faint">
                    Nothing here.
                  </p>
                ) : null}

                {target?.status === status && grip ? (
                  <span className="board-drop" style={{ top: `${target.top}px` }} aria-hidden />
                ) : null}
              </div>
            </section>
          )
        })}
      </div>

      {/* The copy under the finger. `pointer-events: none`, so the element the
          drop is measured against is the board rather than the thing carried. */}
      {grip && dragged ? (
        <div
          className="board-ghost"
          style={{
            width: `${grip.width}px`,
            transform: `translate3d(${ghost.x - grip.dx}px, ${ghost.y - grip.dy}px, 0) rotate(-1.5deg)`,
          }}
          aria-hidden
        >
          <ModCardView
            card={dragged}
            icons={icons}
            locale={locale}
            targetLabel={targetLabels[dragged.id] ?? null}
            dragging={false}
            onOpen={() => {}}
            onGrab={() => {}}
            onHandleKey={() => {}}
          />
        </div>
      ) : null}

      <Fab onClick={() => setCreating(true)} label="Add a mod">
        {icons.add}
      </Fab>

      <Sheet open={creating} onClose={() => setCreating(false)} title="Add a mod">
        {creating ? (
          <ModSheet
            mode="create"
            vehicleId={vehicleId}
            currency={board.currency}
            locale={locale}
            today={today}
            userId={userId}
            others={cards}
            onDone={() => setCreating(false)}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.title ?? 'Mod'}
        action={
          editing ? (
            <button
              type="button"
              onClick={() => remove(editing)}
              className="min-h-touch rounded-md px-3 text-label text-critical"
            >
              Remove
            </button>
          ) : null
        }
      >
        {editing ? (
          <ModSheet
            key={editing.id}
            mode="edit"
            vehicleId={vehicleId}
            currency={board.currency}
            locale={locale}
            today={today}
            userId={userId}
            initial={editing}
            others={cards}
            onInstall={() => install(editing)}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={installing !== null}
        onClose={() => setInstalling(null)}
        title={installing ? `Log ${installing.title}` : 'Log expense'}
      >
        {installing && installPrefill ? (
          <LazyExpenseForm
            key={installing.id}
            mode="create"
            prefill={installPrefill}
            fund={fundOffers[installing.id] ?? null}
            onDone={() => setInstalling(null)}
            {...expense}
          />
        ) : null}
      </Sheet>
    </>
  )
}

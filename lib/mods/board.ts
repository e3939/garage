/**
 * The board's arithmetic: which column a card is in, where a drop lands it, and
 * the smallest set of rows that has to be written to make the board look the way
 * the finger left it.
 *
 * All of it is pure. The drag itself is pointer events and geometry and cannot
 * be tested without a browser; this is the part that can be, and it is the part
 * that decides what gets stored.
 */

import {
  BOARD_STATUSES,
  isBoardStatus,
  type BoardStatus,
  type ModCard,
  type ModStatus,
} from '@/lib/mods/types'
import type { IsoDate } from '@/lib/dates'

export type ModMove = { id: string; status: ModStatus; board_order: number }

export type BoardColumns = Record<BoardStatus, ModCard[]>

/**
 * Cards grouped into their columns, each column in board order.
 *
 * `board_order` is the stored position and ties break on creation time, which is
 * what keeps two cards that have never been dragged in the order they were
 * added rather than in whatever order the planner returned them.
 */
export function columnsOf(cards: readonly ModCard[]): BoardColumns {
  const columns = Object.fromEntries(
    BOARD_STATUSES.map((status) => [status, [] as ModCard[]]),
  ) as BoardColumns

  for (const card of cards) {
    if (!isBoardStatus(card.status)) continue
    columns[card.status].push(card)
  }

  for (const status of BOARD_STATUSES) {
    columns[status].sort(
      (a, b) => a.board_order - b.board_order || a.created_at.localeCompare(b.created_at),
    )
  }

  return columns
}

/**
 * Where a pointer at `y` would drop a card into a column whose cards have these
 * vertical midpoints, in order.
 *
 * The answer is simply how many cards the pointer is already past. Midpoints
 * rather than edges because a card is either mostly above the finger or mostly
 * below it, and there is no third state to fall into.
 *
 * The midpoints passed in never include the card being dragged: it keeps its
 * place in the layout while it is in the air, so nothing reflows mid-drag and
 * the measurements stay still. See `components/mods/mod-board.tsx`.
 */
export function insertionIndex(midpoints: readonly number[], y: number): number {
  let index = 0
  for (const midpoint of midpoints) {
    if (y < midpoint) break
    index += 1
  }
  return index
}

type MoveRequest = {
  id: string
  to: BoardStatus
  /** Position within the target column, counting the card out of the board. */
  index: number
  /** Today in the app's timezone, for the `installed_on` stamp. */
  today: IsoDate
}

export type MoveResult = {
  /** The whole board as it now reads. Same set of cards, new positions. */
  cards: ModCard[]
  /** Only the rows that actually changed. Nothing else is written. */
  moves: ModMove[]
}

/**
 * Apply a drop.
 *
 * The card is taken out of the board, put back at `index` in the target column,
 * and both affected columns are renumbered from zero. Renumbering rather than
 * inserting at a fractional order keeps `board_order` a small dense integer, so
 * the column reads the same whether it is sorted in SQL or in the browser.
 *
 * Landing in Installed stamps `installed_on` if it was not already stamped, and
 * leaving Installed clears it. That mirrors `mod_reorder` exactly, because this
 * is the optimistic view of what that function is about to do.
 */
export function applyMove(cards: readonly ModCard[], request: MoveRequest): MoveResult {
  const moving = cards.find((card) => card.id === request.id)
  if (!moving) return { cards: [...cards], moves: [] }

  const columns = columnsOf(cards)
  const from = isBoardStatus(moving.status) ? moving.status : request.to

  const source = columns[from].filter((card) => card.id !== moving.id)
  const target = from === request.to ? source : columns[request.to]

  const at = Math.max(0, Math.min(request.index, target.length))
  target.splice(at, 0, moving)
  columns[from] = source
  columns[request.to] = target

  const positions = new Map<string, { status: BoardStatus; order: number }>()
  for (const status of [from, request.to]) {
    columns[status].forEach((card, order) => {
      positions.set(card.id, { status, order })
    })
  }

  const moves: ModMove[] = []
  const next = cards.map((card) => {
    const placed = positions.get(card.id)
    if (!placed) return card
    if (placed.status === card.status && placed.order === card.board_order) return card

    moves.push({ id: card.id, status: placed.status, board_order: placed.order })

    return {
      ...card,
      status: placed.status,
      board_order: placed.order,
      installed_on:
        placed.status === 'installed'
          ? (card.installed_on ?? request.today)
          : null,
    }
  })

  return { cards: next, moves }
}

/**
 * Move a card by keyboard: one place up or down within its column, or into the
 * neighbouring column at the same position.
 *
 * Drag is the gesture, but a drag handle that only answers to a finger is a
 * board half the quality floor cannot reach (docs/03-DESIGN.md: "all
 * interactive elements are real buttons"). Returns null when the move would go
 * off the end of the board.
 */
export function nudge(
  cards: readonly ModCard[],
  id: string,
  direction: 'up' | 'down' | 'left' | 'right',
  today: IsoDate,
): MoveResult | null {
  const card = cards.find((entry) => entry.id === id)
  if (!card || !isBoardStatus(card.status)) return null

  const columns = columnsOf(cards)
  const column = columns[card.status]
  const index = column.findIndex((entry) => entry.id === id)
  if (index < 0) return null

  if (direction === 'up' || direction === 'down') {
    const to = direction === 'up' ? index - 1 : index + 1
    if (to < 0 || to >= column.length) return null
    return applyMove(cards, { id, to: card.status, index: to, today })
  }

  const lane = BOARD_STATUSES.indexOf(card.status) + (direction === 'left' ? -1 : 1)
  const status = BOARD_STATUSES[lane]
  if (!status) return null

  // Into the neighbouring column at the same height, or at its end when it is
  // shorter. Landing at the top every time would make three presses right shuffle
  // a plan nobody asked to reorder.
  return applyMove(cards, {
    id,
    to: status,
    index: Math.min(index, columns[status].length),
    today,
  })
}

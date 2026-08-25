// The feed holds pages loaded after the first and the photo the viewer is on.
'use client'

import dynamic from 'next/dynamic'
import { useMemo, useRef, useState } from 'react'

import {
  createTimelineNoteAction,
  deleteTimelineNoteAction,
  loadTimelineNoteAction,
  loadTimelinePageAction,
  type LoadedNote,
} from '@/app/(app)/timeline/actions'
import { FuelGroup } from '@/components/timeline/fuel-group'
import { TimelineNoteForm } from '@/components/timeline/note-form'
import { TimelineRowCard } from '@/components/timeline/timeline-row'
import type { TimelineKindIcons } from '@/components/timeline/kind-icons'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'
import type { IsoDate } from '@/lib/dates'
import type { AttachmentView } from '@/lib/attachments/types'
import {
  buildTimelineItems,
  type TimelineCursor,
  type TimelinePage,
  type TimelineRow,
} from '@/lib/timeline/types'

/**
 * The viewer is a full screen of gesture handling that exists only after
 * somebody taps a photograph. Loaded here it is a chunk fetched on that tap
 * rather than weight on the vehicle page for everyone who just wanted to read
 * the feed.
 */
const PhotoViewer = dynamic(
  () => import('@/components/attachments/photo-viewer').then((module) => module.PhotoViewer),
  { ssr: false },
)


type TimelineFeedProps = {
  vehicleId: string
  page: TimelinePage
  /** One glyph per kind, drawn on the server so Phosphor stays off the wire. */
  icons: TimelineKindIcons
  locale: string
  today: IsoDate
  /** Whose storage folder a note's photos go into. From the session, on the server. */
  userId: string
  /** The vehicle's last known reading, for the note form's odometer hint. */
  lastReading: number
}

type Loaded = {
  /** The server page these extras were loaded on top of. */
  seed: TimelinePage
  extra: TimelineRow[]
  cursor: TimelineCursor | null
  hasMore: boolean
}

function seedState(page: TimelinePage): Loaded {
  return { seed: page, extra: [], cursor: page.cursor, hasMore: page.hasMore }
}

type Viewing = { photos: AttachmentView[]; index: number; context: string }

/**
 * The build log: everything that happened to one car, newest first, grouped by
 * day.
 *
 * Paging is keyset, like the ledger's, so a write that lands while somebody is
 * three pages down cannot make a row appear twice or vanish. A fresh server page
 * drops whatever was loaded on top of the old one, for the same reason it does
 * in the ledger: the alternative is showing rows the server has since changed.
 */
export function TimelineFeed({
  vehicleId,
  page,
  icons,
  locale,
  today,
  userId,
  lastReading,
}: TimelineFeedProps) {
  const { show } = useToast()
  const [loaded, setLoaded] = useState<Loaded>(() => seedState(page))
  const [loading, setLoading] = useState(false)
  const [viewing, setViewing] = useState<Viewing | null>(null)
  /**
   * The note being edited, loaded on the tap that opens it. Only notes open:
   * every other kind of entry is written by the thing that caused it, and is
   * edited where that thing lives.
   */
  const [editing, setEditing] = useState<LoadedNote | null>(null)
  const wanted = useRef<string | null>(null)

  function openNote(refId: string) {
    wanted.current = refId
    void loadTimelineNoteAction(refId).then((loadedNote) => {
      if (!loadedNote || wanted.current !== refId) return
      setEditing(loadedNote)
    })
  }

  function closeNote() {
    wanted.current = null
    setEditing(null)
  }

  function removeNote(loadedNote: LoadedNote) {
    closeNote()
    void deleteTimelineNoteAction(loadedNote.note.id).then((result) => {
      if (!result.ok) {
        show(result.error)
        return
      }
      show('Entry deleted', {
        label: 'Undo',
        // The attachment rows cascaded away with the note; the storage objects
        // did not, so putting the same set back restores the photographs too.
        run: () => {
          void createTimelineNoteAction(
            loadedNote.note,
            loadedNote.attachments.map(({ url: _url, ...draft }) => draft),
          )
        },
      })
    })
  }

  if (loaded.seed !== page) setLoaded(seedState(page))

  const items = useMemo(() => {
    const rows = loaded.seed === page ? [...page.rows, ...loaded.extra] : page.rows
    return buildTimelineItems(rows)
  }, [page, loaded])

  /** The one row that is above the fold, so its first photo can load eagerly. */
  const firstRowKey = useMemo(
    () => items.find((item) => item.kind === 'row')?.key ?? null,
    [items],
  )

  async function loadOlder() {
    if (loading || !loaded.cursor) return
    setLoading(true)
    try {
      const next = await loadTimelinePageAction(vehicleId, loaded.cursor)
      setLoaded((previous) => ({
        ...previous,
        extra: [...previous.extra, ...next.rows],
        cursor: next.cursor,
        hasMore: next.hasMore,
      }))
    } finally {
      setLoading(false)
    }
  }

  function openPhoto(row: TimelineRow, index: number) {
    setViewing({ photos: row.photos, index, context: row.title })
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface p-6 text-body text-ink-muted">
        Nothing logged for this car yet. Expenses, service and fill-ups land here on their own;
        add a note for the things that cost nothing.
      </p>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        {items.map((item) => {
          if (item.kind === 'day') {
            return (
              <h3
                key={item.key}
                className="flex h-8 items-center border-b border-border bg-surface-sunken px-4 text-eyebrow font-display uppercase text-ink-muted"
              >
                {item.heading}
              </h3>
            )
          }

          const icon = icons[item.row.kind]

          return item.row.kind === 'fuel' && item.row.items.length > 0 ? (
            <FuelGroup key={item.key} row={item.row} icon={icon} locale={locale} />
          ) : (
            <TimelineRowCard
              key={item.key}
              row={item.row}
              icon={icon}
              locale={locale}
              eager={item.key === firstRowKey}
              onOpenPhoto={openPhoto}
              onOpen={item.row.kind === 'note' ? () => openNote(item.row.ref_id) : undefined}
            />
          )
        })}
      </div>

      {loaded.hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button onClick={loadOlder} disabled={loading}>
            {loading ? 'Loading' : 'Load older'}
          </Button>
        </div>
      ) : null}

      <Sheet
        open={editing !== null}
        onClose={closeNote}
        title="Edit entry"
        action={
          editing ? (
            <button
              type="button"
              onClick={() => removeNote(editing)}
              className="min-h-touch rounded-md px-3 text-label text-critical"
            >
              Delete
            </button>
          ) : null
        }
      >
        {editing ? (
          <TimelineNoteForm
            key={editing.note.id}
            mode="edit"
            userId={userId}
            vehicleId={vehicleId}
            lastReading={lastReading}
            locale={locale}
            today={today}
            initial={editing.note}
            initialAttachments={editing.attachments}
            onDone={closeNote}
          />
        ) : null}
      </Sheet>

      {viewing ? (
        <PhotoViewer
          photos={viewing.photos}
          index={viewing.index}
          context={viewing.context}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </>
  )
}

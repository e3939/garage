// A file is read, decoded, mapped and previewed on the device. None of that can
// happen on a server that has not been sent the file, and sending it before a
// person has seen what it will do is the thing this screen exists to prevent.
'use client'

import { useMemo, useRef, useState, useTransition, type ChangeEvent } from 'react'
import Link from 'next/link'

import { commitImportAction, existingExpenseIdsAction } from '@/app/(app)/import/actions'
import { Button } from '@/components/ui/button'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import {
  CSV_ENCODINGS,
  decodeCsv,
  ENCODING_LABEL,
  isCsvEncoding,
  type CsvEncoding,
} from '@/lib/csv/decode'
import {
  DELIMITER_LABEL,
  DELIMITERS,
  isDelimiter,
  parseCsv,
  type CsvTable,
  type Delimiter,
} from '@/lib/csv/parse'
import { autoMap, IMPORT_FIELDS, type ColumnMapping } from '@/lib/import/fields'
import { idsInFile, planImport, readyExpenses } from '@/lib/import/rows'
import {
  IMPORT_ROW_LIMIT,
  type ImportCategory,
  type ImportFieldKey,
  type ImportVehicle,
  type PlannedRow,
} from '@/lib/import/types'
import { formatMoney } from '@/lib/money'

/** How much of the file the preview shows. The phase asks for twenty. */
const PREVIEW_ROWS = 20

/** A file bigger than this is not a ledger; it is the wrong file. */
const MAX_BYTES = 10 * 1024 * 1024

type ImportCsvProps = {
  categories: ImportCategory[]
  vehicles: ImportVehicle[]
  currency: string
  locale: string
}

type Loaded = {
  name: string
  bytes: Uint8Array
  encoding: CsvEncoding
  delimiter: Delimiter
  table: CsvTable
}

type Done = { imported: number; skipped: number; categoriesCreated: number }

export function ImportCsv({ categories, vehicles, currency, locale }: ImportCsvProps) {
  const { show } = useToast()
  const input = useRef<HTMLInputElement>(null)

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [existingIds, setExistingIds] = useState<ReadonlySet<string>>(new Set())
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [pending, startTransition] = useTransition()

  /**
   * The dry run. Recomputed whenever anything it depends on moves, which is what
   * makes changing a dropdown redraw the summary immediately — the file is
   * already here and the plan is arithmetic, not a request.
   */
  const plan = useMemo(() => {
    if (!loaded) return null
    return planImport(loaded.table, mapping, { categories, vehicles, currency, existingIds })
  }, [loaded, mapping, categories, vehicles, currency, existingIds])

  function reread(bytes: Uint8Array, name: string, encoding?: CsvEncoding, delimiter?: Delimiter) {
    const decoded = decodeCsv(bytes, encoding)
    const table = parseCsv(decoded.text, delimiter)

    if (table.header.length === 0) {
      setProblem('That file has no header row to map.')
      setLoaded(null)
      return
    }

    const guessed = autoMap(table.header)
    setLoaded({
      name,
      bytes,
      encoding: decoded.encoding,
      delimiter: table.delimiter,
      table,
    })
    setMapping(guessed)
    setProblem(null)
    askAboutIds(table, guessed)
  }

  /** The one part of the dry run that needs the server: what is already here. */
  function askAboutIds(table: CsvTable, columns: ColumnMapping) {
    const ids = idsInFile(table, columns)
    if (ids.length === 0) {
      setExistingIds(new Set())
      return
    }

    startTransition(async () => {
      const result = await existingExpenseIdsAction(ids)
      if (result.ok) setExistingIds(new Set(result.ids.map((id) => id.toLowerCase())))
    })
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setDone(null)

    if (file.size > MAX_BYTES) {
      setProblem('That file is over 10MB. A ledger is smaller than that; check it is the right one.')
      setLoaded(null)
      return
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    reread(bytes, file.name)
  }

  function setEncoding(value: string) {
    if (!loaded || !isCsvEncoding(value)) return
    reread(loaded.bytes, loaded.name, value, loaded.delimiter)
  }

  function setDelimiter(value: string) {
    if (!loaded || !isDelimiter(value)) return
    reread(loaded.bytes, loaded.name, loaded.encoding, value)
  }

  function setColumn(key: ImportFieldKey, value: string) {
    setMapping((current) => {
      const next = { ...current }
      if (value === '') delete next[key]
      else next[key] = Number(value)
      return next
    })

    if (key === 'id' && loaded) {
      const next = { ...mapping }
      if (value === '') delete next.id
      else next.id = Number(value)
      askAboutIds(loaded.table, next)
    }
  }

  function commit() {
    if (!plan || plan.ready === 0) return

    startTransition(async () => {
      const result = await commitImportAction({
        categories: plan.newCategories,
        expenses: readyExpenses(plan),
      })

      if (!result.ok) {
        show(result.error)
        setProblem(result.error)
        return
      }

      setDone({
        imported: result.imported,
        skipped: result.skipped,
        categoriesCreated: result.categoriesCreated,
      })
      setLoaded(null)
      setMapping({})
      setExistingIds(new Set())
      setProblem(null)
      if (input.current) input.current.value = ''
      show(`${result.imported} ${result.imported === 1 ? 'expense' : 'expenses'} imported`)
    })
  }

  const missing = IMPORT_FIELDS.filter(
    (field) => field.required && mapping[field.key] === undefined,
  )

  return (
    <div className="space-y-6">
      {done ? (
        <section className="space-y-2 rounded-md border border-border bg-surface p-4">
          <h2 className="text-label text-ink">
            {done.imported} {done.imported === 1 ? 'expense' : 'expenses'} imported
          </h2>
          <p className="text-caption text-ink-muted">
            {done.categoriesCreated > 0
              ? `${done.categoriesCreated} new ${done.categoriesCreated === 1 ? 'category was' : 'categories were'} created. `
              : ''}
            {done.skipped > 0
              ? `${done.skipped} were already in the ledger and were left alone.`
              : 'Nothing was left behind.'}
          </p>
          <Link
            href="/ledger"
            className="mt-1 inline-flex min-h-touch items-center justify-center rounded-md border border-border-strong bg-surface px-4 text-body text-ink"
          >
            Open the ledger
          </Link>
        </section>
      ) : null}

      <section className="space-y-2 rounded-md border border-border bg-surface p-4">
        <h2 className="text-label text-ink">Choose a file</h2>
        <p className="text-caption text-ink-muted">
          A CSV of expenses. Comma, semicolon, tab or pipe; UTF-8 or Windows-1258. Nothing is
          written until you have read the summary.
        </p>
        <input
          ref={input}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={onFile}
          className={`${INPUT_CLASS} py-2 file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1 file:text-label file:text-ink`}
        />
        {problem ? <p className="text-caption text-critical">{problem}</p> : null}
      </section>

      {loaded && plan ? (
        <>
          <section className="space-y-3 rounded-md border border-border bg-surface p-4">
            <div>
              <h2 className="text-label text-ink">{loaded.name}</h2>
              <p className="text-caption text-ink-muted">
                {loaded.table.rows.length.toLocaleString(locale)}{' '}
                {loaded.table.rows.length === 1 ? 'row' : 'rows'},{' '}
                {loaded.table.header.length} columns. Read as {ENCODING_LABEL[loaded.encoding]},
                separated by {DELIMITER_LABEL[loaded.delimiter].toLowerCase()}.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Encoding" htmlFor="import-encoding" hint="Change this if the accents look wrong.">
                <select
                  id="import-encoding"
                  className={INPUT_CLASS}
                  value={loaded.encoding}
                  onChange={(event) => setEncoding(event.target.value)}
                >
                  {CSV_ENCODINGS.map((encoding) => (
                    <option key={encoding} value={encoding}>
                      {ENCODING_LABEL[encoding]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Separator" htmlFor="import-delimiter" hint="Change this if the columns look wrong.">
                <select
                  id="import-delimiter"
                  className={INPUT_CLASS}
                  value={loaded.delimiter}
                  onChange={(event) => setDelimiter(event.target.value)}
                >
                  {DELIMITERS.map((delimiter) => (
                    <option key={delimiter} value={delimiter}>
                      {DELIMITER_LABEL[delimiter]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-eyebrow font-display uppercase text-ink-muted">Columns</h2>
            <div className="space-y-3 rounded-md border border-border bg-surface p-4">
              {IMPORT_FIELDS.map((field) => (
                <Field
                  key={field.key}
                  label={field.required ? `${field.label} (required)` : field.label}
                  htmlFor={`map-${field.key}`}
                  hint={field.hint}
                >
                  <select
                    id={`map-${field.key}`}
                    className={INPUT_CLASS}
                    value={mapping[field.key] ?? ''}
                    onChange={(event) => setColumn(field.key, event.target.value)}
                  >
                    <option value="">Not in this file</option>
                    {loaded.table.header.map((column, index) => (
                      <option key={`${column}-${index}`} value={index}>
                        {column === '' ? `Column ${index + 1}` : column}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-eyebrow font-display uppercase text-ink-muted">
              First {Math.min(PREVIEW_ROWS, plan.rows.length)} rows
            </h2>
            <ul className="space-y-2">
              {plan.rows.slice(0, PREVIEW_ROWS).map((row) => (
                <PreviewRow key={row.line} row={row} locale={locale} />
              ))}
            </ul>
          </section>

          <section className="space-y-2 rounded-md border border-border bg-surface p-4">
            <h2 className="text-label text-ink">If you import this file</h2>

            {missing.length > 0 ? (
              <p className="text-caption text-critical">
                {missing.map((field) => field.label).join(' and ')}{' '}
                {missing.length === 1 ? 'has' : 'have'} no column yet. Nothing can be read until{' '}
                {missing.length === 1 ? 'it does' : 'they do'}.
              </p>
            ) : (
              <>
                <p className="text-body text-ink">
                  {plan.ready.toLocaleString(locale)}{' '}
                  {plan.ready === 1 ? 'expense' : 'expenses'} will import.{' '}
                  {plan.skipped === 0
                    ? 'Nothing will be skipped.'
                    : `${plan.skipped.toLocaleString(locale)} will be skipped.`}
                </p>

                {plan.reasons.length > 0 ? (
                  <ul className="space-y-1">
                    {plan.reasons.map((reason) => (
                      <li key={reason.reason} className="text-caption text-ink-muted">
                        {reason.reason} &mdash; {reason.count.toLocaleString(locale)}{' '}
                        {reason.count === 1 ? 'row' : 'rows'}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {plan.newCategories.length > 0 ? (
                  <p className="text-caption text-ink-muted">
                    {plan.newCategories.length}{' '}
                    {plan.newCategories.length === 1 ? 'category' : 'categories'} will be created:{' '}
                    {plan.newCategories.map((category) => category.name).join(', ')}. You can
                    change their icons and colours afterwards.
                  </p>
                ) : null}

                {plan.overLimit ? (
                  <p className="text-caption text-critical">
                    This file is longer than {IMPORT_ROW_LIMIT.toLocaleString(locale)} rows, which
                    is as much as one transaction takes. Split it and import the halves.
                  </p>
                ) : null}
              </>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="primary"
                disabled={pending || plan.ready === 0 || plan.overLimit || missing.length > 0}
                onClick={commit}
              >
                {pending
                  ? 'Importing'
                  : `Import ${plan.ready.toLocaleString(locale)} ${plan.ready === 1 ? 'expense' : 'expenses'}`}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setLoaded(null)
                  setMapping({})
                  setProblem(null)
                  if (input.current) input.current.value = ''
                }}
              >
                Choose another file
              </Button>
            </div>

            <p className="text-caption text-ink-faint">
              All of it lands or none of it does. A row that is already in the ledger is left
              exactly as it is.
            </p>
          </section>
        </>
      ) : null}
    </div>
  )
}

/**
 * One preview row: what the file said, and — if it cannot be read — why.
 *
 * A card rather than a cell in a wide table, because the screen is 390px and a
 * table of twelve columns is a table nobody reads on a phone. The amount is
 * shown parsed rather than raw: seeing `150.000 ₫` under a cell that said `150k`
 * is the whole point of a preview.
 */
function PreviewRow({ row, locale }: { row: PlannedRow; locale: string }) {
  const skipped = row.status === 'skipped'

  return (
    <li
      className={[
        'rounded-md border px-3 py-2',
        skipped ? 'border-critical bg-surface' : 'border-border bg-surface',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-caption text-ink-faint">Line {row.line}</span>
        {row.expense ? (
          <span className="font-mono text-label text-ink">
            {formatMoney(row.expense.amount, row.expense.currency, { locale })}
          </span>
        ) : (
          <span className="font-mono text-label text-ink-faint">
            {(row.cells.amount ?? '').trim() || '—'}
          </span>
        )}
      </div>

      <p className="text-caption text-ink">
        {row.expense?.occurred_on ?? ((row.cells.occurred_on ?? '').trim() || 'No date')}
        {row.cells.category ? ` · ${row.cells.category}` : ''}
        {row.cells.vehicle ? ` · ${row.cells.vehicle}` : ''}
        {row.cells.merchant ? ` · ${row.cells.merchant}` : ''}
      </p>

      {skipped ? (
        <ul className="mt-1 space-y-0.5">
          {row.errors.map((error) => (
            <li key={error} className="text-caption text-critical">
              {error}
            </li>
          ))}
        </ul>
      ) : row.newCategory ? (
        <p className="mt-1 text-caption text-ink-muted">
          Creates the category &ldquo;{row.newCategory}&rdquo;
        </p>
      ) : null}
    </li>
  )
}

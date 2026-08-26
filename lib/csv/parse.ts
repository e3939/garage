/**
 * Reading CSV.
 *
 * A hand-written RFC 4180 parser rather than a dependency, because the whole
 * grammar is four states and a route that ships a parsing library to do it would
 * spend more of the route budget on the library than on the screen
 * (CLAUDE.md section 3).
 *
 * What it handles, because real exports contain all of it: quoted fields, quotes
 * doubled inside a quoted field, delimiters and line breaks inside a quoted
 * field, CRLF and LF and lone CR line endings, a trailing newline, and a
 * byte-order mark that survived the decode.
 *
 * What it does not do is guess types. Every cell comes out as the string it was
 * written as; deciding that `150.000` is an amount and `01/02/2026` is a date is
 * `lib/import/rows.ts`'s job, where the answer can be shown to a person before
 * anything is written.
 */

/** The four separators a spreadsheet in the wild actually emits. */
export const DELIMITERS = [',', ';', '\t', '|'] as const

export type Delimiter = (typeof DELIMITERS)[number]

export const DELIMITER_LABEL: Readonly<Record<Delimiter, string>> = {
  ',': 'Comma',
  ';': 'Semicolon',
  '\t': 'Tab',
  '|': 'Pipe',
}

export type CsvTable = {
  header: string[]
  rows: string[][]
  delimiter: Delimiter
  /**
   * The 1-based line each row started on, so an error can name the line in the
   * file rather than the index in an array. A quoted field with a line break in
   * it makes those two numbers disagree, and the file is what a person is
   * looking at.
   */
  lines: number[]
}

export function isDelimiter(value: unknown): value is Delimiter {
  return typeof value === 'string' && (DELIMITERS as readonly string[]).includes(value)
}

/**
 * Split into records without interpreting anything.
 *
 * Trailing blank lines are dropped, but a blank line in the middle is kept as a
 * row of one empty cell: it is a row the file contains, and dropping rows
 * silently is how a count in a summary stops matching the file it describes.
 */
function splitRecords(text: string, delimiter: string): { fields: string[]; line: number }[] {
  const records: { fields: string[]; line: number }[] = []

  let fields: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let recordLine = 1
  let started = false

  const endField = () => {
    fields.push(field)
    field = ''
  }

  const endRecord = () => {
    endField()
    records.push({ fields, line: recordLine })
    fields = []
    started = false
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] as string

    if (!started) {
      recordLine = line
      started = true
    }

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        if (character === '\n') line += 1
        field += character
      }
      continue
    }

    if (character === '"' && field === '') {
      quoted = true
      continue
    }

    if (character === delimiter) {
      endField()
      continue
    }

    if (character === '\r' || character === '\n') {
      // CRLF is one ending, not two.
      if (character === '\r' && text[index + 1] === '\n') index += 1
      line += 1
      endRecord()
      continue
    }

    field += character
  }

  if (started || field !== '') endRecord()

  // A file that ends with a newline produces one empty trailing record; so does
  // a file padded with blank lines. Neither is a row.
  while (records.length > 0) {
    const last = records[records.length - 1]
    if (last && last.fields.length === 1 && last.fields[0]?.trim() === '') records.pop()
    else break
  }

  return records
}

/**
 * Which separator this file uses.
 *
 * Scored on the first few records: a delimiter that gives every record the same
 * number of fields, and more than one field, is the delimiter. Ties go to the
 * one earlier in `DELIMITERS`, which puts the comma first. A file with a single
 * column has no delimiter to find, so it gets the comma and parses the same
 * either way.
 */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.slice(0, 64 * 1024)

  let best: Delimiter = ','
  let bestScore = -1

  for (const delimiter of DELIMITERS) {
    const records = splitRecords(sample, delimiter).slice(0, 10)
    if (records.length === 0) continue

    const counts = records.map((record) => record.fields.length)
    const first = counts[0] ?? 0
    if (first < 2) continue

    const consistent = counts.filter((count) => count === first).length
    // Field count carries the signal; consistency breaks the ties. A file of
    // semicolons read with commas gives one field per line and scores nothing.
    const score = first * 10 + consistent
    if (score > bestScore) {
      bestScore = score
      best = delimiter
    }
  }

  return best
}

/**
 * Header plus rows. Short rows are padded and long rows are kept whole — the
 * preview shows what the file says, and a row with the wrong number of cells is
 * a thing worth seeing rather than a thing worth trimming.
 */
export function parseCsv(text: string, delimiter?: Delimiter): CsvTable {
  const body = text.startsWith('\ufeff') ? text.slice(1) : text
  const separator = delimiter ?? detectDelimiter(body)

  const records = splitRecords(body, separator)
  const [head, ...rest] = records

  const header = (head?.fields ?? []).map((name) => name.trim())
  const width = header.length

  const rows: string[][] = []
  const lines: number[] = []

  for (const record of rest) {
    const row = [...record.fields]
    while (row.length < width) row.push('')
    rows.push(row)
    lines.push(record.line)
  }

  return { header, rows, delimiter: separator, lines }
}

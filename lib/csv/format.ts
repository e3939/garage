/**
 * Writing CSV.
 *
 * RFC 4180 with the two concessions every spreadsheet on a Vietnamese desktop
 * needs: CRLF line endings, and a UTF-8 byte-order mark at the front. Excel
 * reads a mark-less UTF-8 file as the system code page and turns every đ into
 * mojibake, which is exactly the failure this phase exists to prevent — a file
 * you cannot read is not your data.
 *
 * Nothing here formats a number. Amounts leave as the integer minor units they
 * are stored as, dates leave as ISO, and booleans leave as `true` / `false`, so
 * a file this app wrote can be read back by this app without a lossy trip
 * through a locale. Anything a person wants to read prettily, they can read
 * prettily in the app.
 */

/** The mark Excel needs to believe a file is UTF-8. */
export const UTF8_BOM = '\ufeff'

const NEEDS_QUOTING = /["\r\n]/

export type CsvValue = string | number | boolean | null | undefined

/**
 * One cell. Quoted when it holds the delimiter, a quote or a line break, and
 * quotes inside are doubled. `null` and `undefined` are both an empty cell —
 * there is no other honest way to write an absent value in a format with no
 * types.
 */
export function csvCell(value: CsvValue, delimiter = ','): string {
  if (value === null || value === undefined) return ''

  const text = typeof value === 'string' ? value : String(value)
  if (text === '') return ''

  if (text.includes(delimiter) || NEEDS_QUOTING.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export type ToCsvOptions = {
  delimiter?: string
  /** Prefix the byte-order mark. On by default: these files are for Excel. */
  bom?: boolean
}

/** A header row and its rows, as one string ready to be sent as a file. */
export function toCsv(
  columns: readonly string[],
  rows: Iterable<readonly CsvValue[]>,
  options: ToCsvOptions = {},
): string {
  const { delimiter = ',', bom = true } = options

  const lines: string[] = [columns.map((column) => csvCell(column, delimiter)).join(delimiter)]
  for (const row of rows) {
    lines.push(row.map((value) => csvCell(value, delimiter)).join(delimiter))
  }

  return (bom ? UTF8_BOM : '') + lines.join('\r\n') + '\r\n'
}

/**
 * A record shaped by a column list. The keys are the export's own column names,
 * which are also the names the importer auto-maps, so a file that leaves here
 * comes back in without anybody touching a dropdown.
 */
export function rowsFromRecords(
  columns: readonly string[],
  records: readonly Record<string, unknown>[],
): CsvValue[][] {
  return records.map((record) =>
    columns.map((column) => {
      const value = record[column]
      if (value === null || value === undefined) return null
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value
      }
      // jsonb columns — `mod_plans.links` is the only one — travel as JSON.
      return JSON.stringify(value)
    }),
  )
}

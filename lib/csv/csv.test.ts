/**
 * The file layer, tested where a silent bug costs the whole phase.
 *
 * A parser that drops the last row, a delimiter guess that reads a
 * semicolon file as one column, or a decode that turns đ into two characters
 * are all failures nobody sees until their money is in the app with the wrong
 * shape. CLAUDE.md section 7 names money, budget and fuel as the places worth
 * testing for exactly that reason; reading somebody's file belongs on the list.
 */

import { describe, expect, it } from 'vitest'

import { csvCell, rowsFromRecords, toCsv, UTF8_BOM } from '@/lib/csv/format'
import { decodeCsv, detectEncoding } from '@/lib/csv/decode'
import { detectDelimiter, parseCsv } from '@/lib/csv/parse'

describe('csvCell', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvCell('Fuel')).toBe('Fuel')
    expect(csvCell(150000)).toBe('150000')
    expect(csvCell(true)).toBe('true')
  })

  it('writes an absent value as an empty cell', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('quotes the delimiter, a quote and a line break', () => {
    expect(csvCell('Shell, Nguyen Trai')).toBe('"Shell, Nguyen Trai"')
    expect(csvCell('He said "no"')).toBe('"He said ""no"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('quotes against the delimiter in use, not against the comma', () => {
    expect(csvCell('a,b', ';')).toBe('a,b')
    expect(csvCell('a;b', ';')).toBe('"a;b"')
  })
})

describe('toCsv', () => {
  it('writes a byte-order mark and CRLF endings', () => {
    const csv = toCsv(['a', 'b'], [[1, 2]])
    expect(csv.startsWith(UTF8_BOM)).toBe(true)
    expect(csv).toBe(`${UTF8_BOM}a,b\r\n1,2\r\n`)
  })

  it('can be asked for no mark', () => {
    expect(toCsv(['a'], [['x']], { bom: false })).toBe('a\r\nx\r\n')
  })
})

describe('rowsFromRecords', () => {
  it('follows the column list, and writes json for anything structured', () => {
    const rows = rowsFromRecords(
      ['name', 'links', 'missing'],
      [{ name: 'Coilovers', links: [{ label: 'shop', url: 'https://x.test' }] }],
    )
    expect(rows[0]?.[0]).toBe('Coilovers')
    expect(rows[0]?.[1]).toBe('[{"label":"shop","url":"https://x.test"}]')
    expect(rows[0]?.[2]).toBe(null)
  })
})

describe('parseCsv', () => {
  it('reads a header and its rows', () => {
    const table = parseCsv('date,amount\n2026-08-26,150000\n2026-08-27,90000\n')
    expect(table.header).toEqual(['date', 'amount'])
    expect(table.rows).toEqual([
      ['2026-08-26', '150000'],
      ['2026-08-27', '90000'],
    ])
  })

  it('keeps the last row when the file does not end with a newline', () => {
    const table = parseCsv('a,b\n1,2')
    expect(table.rows).toEqual([['1', '2']])
  })

  it('reads quoted fields, doubled quotes and embedded breaks', () => {
    const table = parseCsv('a,b\n"Shell, Q1","said ""hi"""\n"two\nlines",x\n')
    expect(table.rows[0]).toEqual(['Shell, Q1', 'said "hi"'])
    expect(table.rows[1]).toEqual(['two\nlines', 'x'])
  })

  it('numbers the lines of the file, not the rows of the array', () => {
    const table = parseCsv('a,b\n"two\nlines",x\nlast,y\n')
    // Row two starts on line four, because row one spans lines two and three.
    expect(table.lines).toEqual([2, 4])
  })

  it('handles CRLF and a lone CR', () => {
    expect(parseCsv('a,b\r\n1,2\r\n').rows).toEqual([['1', '2']])
    expect(parseCsv('a,b\r1,2\r').rows).toEqual([['1', '2']])
  })

  it('pads a short row so the preview lines up', () => {
    expect(parseCsv('a,b,c\n1,2\n').rows).toEqual([['1', '2', '']])
  })

  it('drops a byte-order mark that survived the decode', () => {
    expect(parseCsv(`${UTF8_BOM}date,amount\n2026-08-26,1\n`).header).toEqual(['date', 'amount'])
  })

  it('round-trips what toCsv wrote', () => {
    const written = toCsv(['merchant', 'note'], [['Shell, Q1', 'said "hi"'], ['Petrolimex', null]])
    const table = parseCsv(written)
    expect(table.rows).toEqual([
      ['Shell, Q1', 'said "hi"'],
      ['Petrolimex', ''],
    ])
  })
})

describe('detectDelimiter', () => {
  it('finds the comma', () => {
    expect(detectDelimiter('a,b,c\n1,2,3\n')).toBe(',')
  })

  it('finds the semicolon in a file whose numbers use commas', () => {
    expect(detectDelimiter('ngay;so tien;ghi chu\n26/08/2026;150,000;xang\n')).toBe(';')
  })

  it('finds the tab', () => {
    expect(detectDelimiter('a\tb\n1\t2\n')).toBe('\t')
  })

  it('falls back to the comma for a single column', () => {
    expect(detectDelimiter('amount\n150000\n')).toBe(',')
  })

  it('is not fooled by a comma inside a quoted field', () => {
    expect(detectDelimiter('a;b\n"one, two";3\n"three, four";5\n')).toBe(';')
  })
})

/** Bytes as a spreadsheet would actually write them. */
function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

describe('detectEncoding', () => {
  it('sees a UTF-8 byte-order mark', () => {
    expect(detectEncoding(bytes(0xef, 0xbb, 0xbf, 0x61))).toBe('utf-8-bom')
  })

  it('sees both UTF-16 marks', () => {
    expect(detectEncoding(bytes(0xff, 0xfe, 0x61, 0x00))).toBe('utf-16le')
    expect(detectEncoding(bytes(0xfe, 0xff, 0x00, 0x61))).toBe('utf-16be')
  })

  it('reads valid UTF-8 as UTF-8', () => {
    expect(detectEncoding(new TextEncoder().encode('Xăng, 150.000 đ'))).toBe('utf-8')
  })

  it('falls to Windows-1258 for bytes that are not UTF-8', () => {
    // 0xE3 0xEC = ă + combining acute, which is `ắ` in 1258 and invalid UTF-8.
    expect(detectEncoding(bytes(0x58, 0xe3, 0xec, 0x6e, 0x67))).toBe('windows-1258')
  })
})

describe('decodeCsv', () => {
  it('strips the UTF-8 mark so the first header is readable', () => {
    const raw = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('date,amount')])
    const decoded = decodeCsv(raw)
    expect(decoded.encoding).toBe('utf-8-bom')
    expect(decoded.text).toBe('date,amount')
  })

  it('reads Windows-1258 and composes its tone marks', () => {
    // "Xăng" as 1258 writes it: X, ă, combining acute is not needed here, but
    // the dong sign at 0xFE and a hook-above at 0xD2 are pure 1258.
    const decoded = decodeCsv(bytes(0x58, 0xe3, 0xec, 0x6e, 0x67, 0x2c, 0xfe))
    expect(decoded.encoding).toBe('windows-1258')
    // Composed: one character, not a vowel plus a floating accent.
    expect(decoded.text).toBe('Xắng,₫')
    expect([...decoded.text].length).toBe(6)
  })

  it('can be overridden when the guess is wrong', () => {
    const raw = new TextEncoder().encode('a,b')
    expect(decodeCsv(raw, 'windows-1258').encoding).toBe('windows-1258')
    expect(decodeCsv(raw, 'windows-1258').detected).toBe(false)
  })
})

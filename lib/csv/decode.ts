/**
 * Turning the bytes of an uploaded file into text.
 *
 * The phase names two encodings and both of them are here for a reason:
 *
 *   **UTF-8 with a byte-order mark** is what Excel writes when it is asked for
 *   "CSV UTF-8", and the mark has to come off before parsing or the first header
 *   is called `\ufeffdate` and matches nothing.
 *
 *   **Windows-1258** is the Vietnamese code page, and it is what an older
 *   spreadsheet on a Vietnamese Windows install produces from "Save as CSV". It
 *   is not Latin-1 with extra letters: the tone marks are separate combining
 *   characters, so `ắ` arrives as two code points and `Nguyễn` sorts and
 *   compares differently from the same name typed into this app. That is why the
 *   decode is followed by an NFC normalisation — after it, the two are the same
 *   string, which is what makes matching a category by name work at all.
 *
 * Detection is by elimination rather than by guessing, which is the only way to
 * be sure: a byte-order mark settles it outright, and otherwise the file is
 * decoded as UTF-8 with `fatal` on. Valid UTF-8 is UTF-8 — the encoding is
 * self-checking and a byte sequence that happens to be valid multi-byte UTF-8
 * and *meant* to be Vietnamese single-byte text is vanishingly rare. Anything
 * that throws is a single-byte file, and for this app that means Windows-1258.
 *
 * `TextDecoder` does the work in both places this runs. The Encoding Standard
 * requires every label here of every browser, and Node has carried them since
 * full ICU became the default build.
 */

export const CSV_ENCODINGS = ['utf-8', 'utf-8-bom', 'utf-16le', 'utf-16be', 'windows-1258'] as const

export type CsvEncoding = (typeof CSV_ENCODINGS)[number]

export const ENCODING_LABEL: Readonly<Record<CsvEncoding, string>> = {
  'utf-8': 'UTF-8',
  'utf-8-bom': 'UTF-8 with byte-order mark',
  'utf-16le': 'UTF-16 little-endian',
  'utf-16be': 'UTF-16 big-endian',
  'windows-1258': 'Windows-1258 (Vietnamese)',
}

/** What `TextDecoder` should be asked for, per detected encoding. */
const DECODER_LABEL: Readonly<Record<CsvEncoding, string>> = {
  'utf-8': 'utf-8',
  'utf-8-bom': 'utf-8',
  'utf-16le': 'utf-16le',
  'utf-16be': 'utf-16be',
  'windows-1258': 'windows-1258',
}

export function isCsvEncoding(value: unknown): value is CsvEncoding {
  return typeof value === 'string' && (CSV_ENCODINGS as readonly string[]).includes(value)
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

/** Which encoding these bytes are in. See the note at the top for the method. */
export function detectEncoding(bytes: Uint8Array): CsvEncoding {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) return 'utf-8-bom'
  if (startsWith(bytes, [0xff, 0xfe])) return 'utf-16le'
  if (startsWith(bytes, [0xfe, 0xff])) return 'utf-16be'

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return 'utf-8'
  } catch {
    return 'windows-1258'
  }
}

export type DecodedFile = {
  text: string
  encoding: CsvEncoding
  /** True when the encoding was detected rather than chosen. */
  detected: boolean
}

/**
 * Bytes in, text out, with the byte-order mark removed and the result composed.
 *
 * Pass `override` to read the file as something other than what was detected —
 * the screen offers that, because detection is a judgement and the person
 * holding the file knows better than this function does.
 */
export function decodeCsv(bytes: Uint8Array, override?: CsvEncoding): DecodedFile {
  const detectedEncoding = detectEncoding(bytes)
  const encoding = override ?? detectedEncoding

  const decoder = new TextDecoder(DECODER_LABEL[encoding])
  let text = decoder.decode(bytes)

  // A UTF-16 decode eats its own mark; a UTF-8 one does not.
  if (text.startsWith('\ufeff')) text = text.slice(1)

  // Windows-1258 writes tone marks as separate combining characters. Composing
  // them is what makes "Nguyễn" from a 1258 file equal "Nguyễn" typed here.
  return { text: text.normalize('NFC'), encoding, detected: override === undefined }
}

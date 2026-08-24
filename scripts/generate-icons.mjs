/**
 * Draws the app mark and renders the PWA icon set.
 *
 * The mark is the odometer strip from docs/03-DESIGN.md reduced to its bones:
 * a cream drum panel on brick, split into three cells by the drum gaps. No
 * letterform, so it survives being 48px on a home screen.
 *
 * Run with `npm run icons`. Output is committed — these are assets, not build
 * artefacts, and the build must not depend on sharp at deploy time.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const BRICK = '#A95031'
const CREAM = '#FDF0AE'
const PAPER = '#FBF7EC'

/**
 * @param {object} options
 * @param {number} options.strip Width of the drum panel, as a fraction of the canvas.
 * @param {number} options.radius Corner radius of the canvas, as a fraction.
 */
function mark({ strip, radius }) {
  const size = 512
  const w = size * strip
  const h = w * 0.525
  const x = (size - w) / 2
  const y = (size - h) / 2
  const r = h * 0.12
  const gap = w * 0.032
  const inset = h * 0.14

  const dividers = [1, 2]
    .map((i) => {
      const gx = x + (w / 3) * i - gap / 2
      return `<rect x="${gx.toFixed(2)}" y="${(y + inset).toFixed(2)}" width="${gap.toFixed(2)}" height="${(h - inset * 2).toFixed(2)}" fill="${BRICK}" />`
    })
    .join('')

  const rounding = radius > 0 ? `rx="${(size * radius).toFixed(2)}"` : ''

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" ${rounding} fill="${BRICK}" />
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${r.toFixed(2)}" fill="${CREAM}" />
      ${dividers}
    </svg>`,
  )
}

// A square mark for the app icon, and a smaller one for maskable so the whole
// strip stays inside the 80% safe zone after a launcher crops it to a circle.
const standard = mark({ strip: 0.625, radius: 0.18 })
const maskable = mark({ strip: 0.5, radius: 0 })

const targets = [
  { file: 'public/icons/icon-192.png', source: standard, size: 192 },
  { file: 'public/icons/icon-512.png', source: standard, size: 512 },
  { file: 'public/icons/maskable-192.png', source: maskable, size: 192 },
  { file: 'public/icons/maskable-512.png', source: maskable, size: 512 },
  { file: 'app/apple-icon.png', source: mark({ strip: 0.625, radius: 0 }), size: 180 },
]

for (const { file, source, size } of targets) {
  const out = resolve(root, file)
  await mkdir(dirname(out), { recursive: true })
  await sharp(source)
    .resize(size, size)
    .flatten({ background: PAPER })
    .png({ compressionLevel: 9 })
    .toFile(out)
  process.stdout.write(`${file}  ${size}x${size}\n`)
}

// The favicon is served as SVG; Next picks up app/icon.svg automatically.
await writeFile(resolve(root, 'app/icon.svg'), mark({ strip: 0.7, radius: 0.18 }))
process.stdout.write('app/icon.svg\n')

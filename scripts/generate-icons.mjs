/**
 * PWA 用アイコン(PNG)を生成するスクリプト。外部ライブラリは使わない。
 *   node scripts/generate-icons.mjs
 *
 * デザインは icons/icon.svg と同じ（青の背景に、写真を表す白いカード・山・太陽）。
 * SVG を描画するライブラリを使わずに済むよう、同じ図形をここで直接塗る。
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons')

const BG_TOP = [10, 132, 255] // #0a84ff
const BG_BOTTOM = [94, 92, 230] // #5e5ce6
const CARD = [255, 255, 255]
const MOUNTAIN_BACK = [100, 170, 255]
const MOUNTAIN_FRONT = [10, 110, 230]
const SUN = [255, 204, 0]

function crc32(buf) {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(size, colorAt) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let offset = 0
  const SAMPLES = 4 // 4x4 で平均してギザギザを抑える
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const c = colorAt((x + (sx + 0.5) / SAMPLES) / size, (y + (sy + 0.5) / SAMPLES) / size)
          r += c[0]
          g += c[1]
          b += c[2]
        }
      }
      const n = SAMPLES * SAMPLES
      raw[offset++] = Math.round(r / n)
      raw[offset++] = Math.round(g / n)
      raw[offset++] = Math.round(b / n)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.min(Math.max(x, x0 + r), x1 - r)
  const cy = Math.min(Math.max(y, y0 + r), y1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

/** 頂点 (ax, ay) から下に広がる三角形（山） */
function inMountain(x, y, ax, ay, slope) {
  return y >= ay && Math.abs(x - ax) <= (y - ay) * slope
}

/** x, y は 0..1。scale を小さくすると絵柄が内側に寄る（maskable 用）。 */
function colorAt(x, y, scale) {
  const t = (x + y) / 2
  const bg = BG_TOP.map((v, i) => v + (BG_BOTTOM[i] - v) * t)
  const nx = (x - 0.5) / scale + 0.5
  const ny = (y - 0.5) / scale + 0.5

  if (!inRoundRect(nx, ny, 0.2, 0.26, 0.8, 0.74, 0.06)) return bg
  if ((nx - 0.64) ** 2 + (ny - 0.4) ** 2 <= 0.055 ** 2) return SUN
  if (inMountain(nx, ny, 0.6, 0.5, 0.82)) return MOUNTAIN_FRONT
  if (inMountain(nx, ny, 0.4, 0.42, 0.7)) return MOUNTAIN_BACK
  return CARD
}

function makeIcon(size, { maskable }) {
  const scale = maskable ? 0.78 : 1
  return encodePng(size, (x, y) => colorAt(x, y, scale))
}

mkdirSync(OUT_DIR, { recursive: true })
const files = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: false }],
]
for (const [name, size, options] of files) {
  writeFileSync(join(OUT_DIR, name), makeIcon(size, options))
  console.log('generated', name)
}

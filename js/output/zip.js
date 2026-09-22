/**
 * ZIP の作成（同梱の fflate を使用）。
 * JPEG / PNG はすでに圧縮済みで、さらに圧縮してもほとんど小さくならないため無圧縮で格納する。
 */
import { zipSync } from '../../vendor/fflate/fflate.js'

/**
 * @param {{ name: string, blob: Blob }[]} entries name は重複していないこと
 * @returns {Promise<Blob>}
 */
export async function createZip(entries) {
  const files = {}
  const mtime = new Date()
  for (const { name, blob } of entries) {
    files[name] = [new Uint8Array(await blob.arrayBuffer()), { level: 0, mtime }]
  }
  const data = zipSync(files)
  return new Blob([data], { type: 'application/zip' })
}

/** ZIP のファイル名（例：images_20260923_1530.zip） */
export function zipFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `images_${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}.zip`
}

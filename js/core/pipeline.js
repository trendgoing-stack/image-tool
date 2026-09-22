/**
 * 1枚分の処理：デコード → リサイズ → 背景色の合成 → エンコード
 */
import { decodeImage } from './decode.js'
import { computeTargetSize, drawResized } from './resize.js'
import { canvasToBlob, encodeToTargetSize, extensionOf, fillBackground, resolveOutputType } from './encode.js'
import { releaseCanvas } from './limits.js'
import { backgroundColorOf } from '../settings/model.js'
import { outputFileName } from '../output/naming.js'

/**
 * @param {File} file
 * @param {object} settings normalizeSettings 済みの設定
 * @returns {Promise<{
 *   name: string, blob: Blob, type: string,
 *   width: number, height: number, srcWidth: number, srcHeight: number,
 *   clamped: boolean, quality: number | null, targetReached: boolean | null
 * }>}
 */
export async function processImage(file, settings) {
  const decoded = await decodeImage(file)
  let canvas = null
  try {
    const target = computeTargetSize(decoded.width, decoded.height, settings.resize)
    canvas = drawResized(decoded.source, decoded.width, decoded.height, target.width, target.height)
    // 描き終えたらデコード結果はすぐ手放す
    decoded.close()

    const type = resolveOutputType(file, settings.format)
    let blob
    let quality = null
    let targetReached = null
    if (type === 'image/jpeg') {
      fillBackground(canvas, backgroundColorOf(settings))
      if (settings.targetSizeEnabled) {
        const r = await encodeToTargetSize(canvas, settings.targetSizeKB * 1024, settings.quality)
        blob = r.blob
        quality = r.quality
        targetReached = r.reached
      } else {
        quality = settings.quality
        blob = await canvasToBlob(canvas, type, quality)
      }
    } else {
      blob = await canvasToBlob(canvas, type)
    }

    return {
      name: outputFileName(file.name, { ...target, ext: extensionOf(type) }),
      blob,
      type,
      width: target.width,
      height: target.height,
      srcWidth: decoded.width,
      srcHeight: decoded.height,
      clamped: target.clamped,
      quality,
      targetReached,
    }
  } finally {
    decoded.close()
    releaseCanvas(canvas)
  }
}

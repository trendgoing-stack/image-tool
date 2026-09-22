/**
 * 1枚分の処理：デコード → リサイズ → 背景色の合成 → エンコード
 */
import { decodeImage } from './decode.js'
import { computeTargetSize, drawResized } from './resize.js'
import { canvasToBlob, encodeToTargetSize, extensionOf, fillBackground, resolveOutputType } from './encode.js'
import { clampToCanvasLimit, createCanvas, releaseCanvas } from './limits.js'
import { renderEdits } from '../editor/render.js'
import { backgroundColorOf } from '../settings/model.js'
import { outputFileName } from '../output/naming.js'

const THUMB_EDGE = 320

/** 一覧表示用の小さな JPEG を作る（大きな画像を画面に並べるとメモリを使い切るため） */
async function makeThumbnail(source, width, height) {
  const s = Math.min(1, THUMB_EDGE / Math.max(width, height))
  const canvas = createCanvas(Math.max(1, Math.round(width * s)), Math.max(1, Math.round(height * s)))
  try {
    const ctx = canvas.getContext('2d')
    // 透過部分がわかるよう市松模様ではなく薄いグレーを敷く
    ctx.fillStyle = '#e5e5ea'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    return await canvasToBlob(canvas, 'image/jpeg', 70)
  } finally {
    releaseCanvas(canvas)
  }
}

/**
 * @param {File} file
 * @param {object} settings normalizeSettings 済みの設定
 * @param {{ thumbnails?: boolean, edits?: object[] }} [options]
 *   edits: 編集モードの加工リスト（editor/render.js を参照）
 * @returns {Promise<{
 *   name: string, blob: Blob, type: string,
 *   width: number, height: number, srcWidth: number, srcHeight: number,
 *   clamped: boolean, quality: number | null, targetReached: boolean | null,
 *   thumbBefore: Blob | null, thumbAfter: Blob | null
 * }>}
 */
export async function processImage(file, settings, options = {}) {
  const decoded = await decodeImage(file)
  let canvas = null
  try {
    const target = computeTargetSize(decoded.width, decoded.height, settings.resize)
    const thumbBefore = options.thumbnails ? await makeThumbnail(decoded.source, decoded.width, decoded.height) : null
    if (options.edits?.length) {
      // 編集モード：canvas の上限内で最大の解像度（通常は元の解像度）で加工してから縮小する
      const work = clampToCanvasLimit(decoded.width, decoded.height)
      const workCanvas = drawResized(decoded.source, decoded.width, decoded.height, work.width, work.height)
      decoded.close()
      try {
        renderEdits(workCanvas, options.edits)
        canvas = drawResized(workCanvas, work.width, work.height, target.width, target.height)
      } finally {
        releaseCanvas(workCanvas)
      }
    } else {
      canvas = drawResized(decoded.source, decoded.width, decoded.height, target.width, target.height)
      // 描き終えたらデコード結果はすぐ手放す
      decoded.close()
    }

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
    const thumbAfter = options.thumbnails ? await makeThumbnail(canvas, canvas.width, canvas.height) : null

    return {
      thumbBefore,
      thumbAfter,
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

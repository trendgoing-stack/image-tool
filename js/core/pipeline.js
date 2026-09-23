/**
 * 1枚分の処理：デコード → リサイズ → 背景色の合成 → エンコード
 */
import { decodeImage } from './decode.js'
import { computeTargetSize, drawResized } from './resize.js'
import { canvasToBlob, encodeToTargetSize, extensionOf, fillBackground, resolveOutputType } from './encode.js'
import { clampToCanvasLimit, createCanvas, releaseCanvas } from './limits.js'
import { renderEdits } from '../editor/render.js'
import { croppedSize, isFullCrop, isIdentityGeometry, makeView } from '../editor/geometry.js'
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
 * @param {{ thumbnails?: boolean, edit?: { geometry: object, ops: object[] } }} [options]
 *   edit: 編集モードの回転・切り取り（editor/geometry.js）と加工リスト（editor/render.js）
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
    const edit = options.edit
    const editing = Boolean(edit && (edit.ops.length > 0 || !isIdentityGeometry(edit.geometry)))
    // 切り取った場合は、切り取ったあとの大きさを「元の大きさ」としてリサイズする
    const base = editing ? croppedSize(edit.geometry, decoded.width, decoded.height) : decoded
    const baseW = Math.max(1, Math.round(base.width))
    const baseH = Math.max(1, Math.round(base.height))
    const target = computeTargetSize(baseW, baseH, settings.resize)
    const thumbBefore = options.thumbnails ? await makeThumbnail(decoded.source, decoded.width, decoded.height) : null
    if (editing) {
      // 編集モード：回転・切り取りした範囲を、元の写真から直接 canvas の上限内で最大の解像度で描き、
      // そこに加工を適用してから縮小する（大きな写真でも、切り取った範囲が上限内なら元の解像度のまま）
      const work = clampToCanvasLimit(baseW, baseH)
      const view = makeView(edit.geometry, decoded.width, decoded.height, work.width / base.width)
      const workCanvas = createCanvas(view.width, view.height)
      view.drawSource(workCanvas.getContext('2d'), decoded.source)
      decoded.close()
      try {
        renderEdits(workCanvas, edit.ops, view)
        canvas = drawResized(workCanvas, view.width, view.height, target.width, target.height)
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
      // 切り取った場合も大きさが変わるので、ファイル名に長辺の px を付ける
      name: outputFileName(file.name, {
        ...target,
        resized: target.resized || (editing && !isFullCrop(edit.geometry.crop)),
        ext: extensionOf(type),
      }),
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

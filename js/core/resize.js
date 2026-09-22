/**
 * リサイズ：出力サイズの計算と、画質を保った縮小描画。
 */
import { clampToCanvasLimit, createCanvas, fitsCanvas, releaseCanvas } from './limits.js'

/**
 * 設定から出力サイズを求める。
 * @param {number} srcW 向き反映後の元の幅
 * @param {number} srcH 向き反映後の元の高さ
 * @param {object} r 設定の resize 部分
 * @returns {{ width: number, height: number, resized: boolean, clamped: boolean }}
 *   resized: 指定によって大きさが変わったか（ファイル名の付け方に使う）
 *   clamped: canvas の上限のために自動縮小したか
 */
export function computeTargetSize(srcW, srcH, r) {
  let w = srcW
  let h = srcH

  if (r.mode === 'pixels') {
    const tw = positive(r.width)
    const th = positive(r.height)
    if (r.keepAspect) {
      // 入力された辺に合わせる。両方あれば枠内に収める
      const scales = []
      if (tw) scales.push(tw / srcW)
      if (th) scales.push(th / srcH)
      if (scales.length) {
        const s = Math.min(...scales)
        w = srcW * s
        h = srcH * s
      }
    } else {
      if (tw) w = tw
      if (th) h = th
    }
  } else if (r.mode === 'percent') {
    const p = positive(r.percent)
    if (p) {
      w = (srcW * p) / 100
      h = (srcH * p) / 100
    }
  } else if (r.mode === 'longEdge') {
    const le = positive(r.longEdge)
    if (le) {
      const s = le / Math.max(srcW, srcH)
      w = srcW * s
      h = srcH * s
    }
  }

  if (r.noEnlarge) {
    if (r.mode === 'pixels' && !r.keepAspect) {
      w = Math.min(w, srcW)
      h = Math.min(h, srcH)
    } else {
      const s = Math.min(1, srcW / w, srcH / h)
      w *= s
      h *= s
    }
  }

  w = Math.max(1, Math.round(w))
  h = Math.max(1, Math.round(h))
  const resized = w !== srcW || h !== srcH
  const limited = clampToCanvasLimit(w, h)
  return { width: limited.width, height: limited.height, resized: resized || limited.clamped, clamped: limited.clamped }
}

function positive(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function draw(source, canvas) {
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
}

/**
 * source を dstW×dstH の canvas に描く。
 * 大きく縮小するときは 1/2 ずつ段階的に縮めて画質を保つ。
 * 元画像と同じ大きさの canvas は作らず、最初の段階から目標サイズ×2ⁿ に直接描く。
 * @returns {HTMLCanvasElement} 呼び出し側で releaseCanvas すること
 */
export function drawResized(source, srcW, srcH, dstW, dstH) {
  // 何回半分にできるか（各辺とも元より小さい段階だけを使う）
  let k = 0
  while (
    dstW * 2 ** (k + 1) < srcW &&
    dstH * 2 ** (k + 1) < srcH &&
    fitsCanvas(dstW * 2 ** (k + 1), dstH * 2 ** (k + 1))
  ) {
    k++
  }

  let canvas = createCanvas(dstW * 2 ** k, dstH * 2 ** k)
  draw(source, canvas)
  while (k > 0) {
    k--
    const next = createCanvas(dstW * 2 ** k, dstH * 2 ** k)
    draw(canvas, next)
    releaseCanvas(canvas)
    canvas = next
  }
  return canvas
}

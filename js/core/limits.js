/**
 * canvas のサイズ上限まわりの計算。
 * iOS Safari は 1枚の canvas の画素数が 16,777,216px（4096×4096 相当）を超えると描画に失敗するため、
 * どの canvas もこの上限内に収める。
 */
export const MAX_CANVAS_PIXELS = 16_777_216

/** 画素数が上限内か */
export function fitsCanvas(width, height) {
  return width * height <= MAX_CANVAS_PIXELS
}

/**
 * 縦横比を保ったまま上限内に収まるサイズを返す。収まっていればそのまま返す。
 * @returns {{ width: number, height: number, clamped: boolean }}
 */
export function clampToCanvasLimit(width, height) {
  if (fitsCanvas(width, height)) return { width, height, clamped: false }
  const scale = Math.sqrt(MAX_CANVAS_PIXELS / (width * height))
  let w = Math.max(1, Math.floor(width * scale))
  let h = Math.max(1, Math.floor(height * scale))
  // 丸め誤差で超える場合に備えて 1px ずつ詰める
  while (w * h > MAX_CANVAS_PIXELS) {
    if (w >= h) w--
    else h--
  }
  return { width: w, height: h, clamped: true }
}

/** canvas を作る */
export function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** canvas が使っているメモリを手放す（iOS はこれをしないとメモリ不足で落ちやすい） */
export function releaseCanvas(canvas) {
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

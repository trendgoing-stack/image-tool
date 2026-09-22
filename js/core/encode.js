/**
 * 背景色の合成とエンコード（JPEG / PNG）。
 * canvas の既定の色空間は sRGB なので、出力は sRGB になる。
 */

export const MIN_QUALITY = 10
export const MAX_QUALITY = 100
const MAX_SEARCH_STEPS = 8

/** 入力ファイルと設定から出力形式（MIME）を決める */
export function resolveOutputType(file, format) {
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'png') return 'image/png'
  // 元の形式のまま。JPEG / PNG 以外は JPEG にする
  if (file.type === 'image/png') return 'image/png'
  return 'image/jpeg'
}

export function extensionOf(type) {
  return type === 'image/png' ? 'png' : 'jpg'
}

/**
 * 透過部分の下に背景色を敷く（JPEG 出力時に使う）。
 * 不透明な画素は変わらないので、透過がない画像に行っても結果は同じ。
 */
export function fillBackground(canvas, color) {
  const ctx = canvas.getContext('2d')
  ctx.save()
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
}

/** @returns {Promise<Blob>} */
export function canvasToBlob(canvas, type, qualityPercent) {
  return new Promise((resolve, reject) => {
    const q = type === 'image/jpeg' ? qualityPercent / 100 : undefined
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('画像の書き出しに失敗しました（メモリ不足の可能性があります）'))
      },
      type,
      q,
    )
  })
}

/**
 * 目標サイズ以下になる最高画質を二分探索で探す（JPEG のみ）。
 * 最低画質でも届かないときは、試した中で最小の結果を返す。
 * @returns {Promise<{ blob: Blob, quality: number, reached: boolean }>}
 */
export async function encodeToTargetSize(canvas, targetBytes, maxQuality = MAX_QUALITY) {
  let lo = MIN_QUALITY
  let hi = Math.max(MIN_QUALITY, Math.min(MAX_QUALITY, maxQuality))
  let best = null
  let smallest = null

  for (let step = 0; step < MAX_SEARCH_STEPS && lo <= hi; step++) {
    // 1回目は上限の画質で試す（それで届けば探索不要）
    const q = step === 0 ? hi : Math.round((lo + hi) / 2)
    const blob = await canvasToBlob(canvas, 'image/jpeg', q)
    if (!smallest || blob.size < smallest.blob.size) smallest = { blob, quality: q }
    if (blob.size <= targetBytes) {
      if (!best || q > best.quality) best = { blob, quality: q }
      lo = q + 1
    } else {
      hi = q - 1
    }
  }

  if (best) return { ...best, reached: true }
  // 最低画質をまだ試していなければ試す
  if (smallest.quality !== MIN_QUALITY) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', MIN_QUALITY)
    if (blob.size <= targetBytes) return { blob, quality: MIN_QUALITY, reached: true }
    if (blob.size < smallest.blob.size) smallest = { blob, quality: MIN_QUALITY }
  }
  return { ...smallest, reached: false }
}

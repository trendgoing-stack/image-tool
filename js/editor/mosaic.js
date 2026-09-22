/**
 * モザイク：縮小してから補間なしで拡大する。
 */
import { createCanvas, releaseCanvas } from '../core/limits.js'

/**
 * 元の canvas の (x, y, w, h) の範囲をモザイクにした canvas を返す（大きさ w×h）。
 * 範囲がブロックの倍数でない場合は、ブロックをわずかに伸ばして範囲全体をすき間なく覆う
 * （端に元の画像が透けて見えないように）。
 * @param {HTMLCanvasElement} source
 * @param {number} block ブロックの大きさの目安（px）
 */
export function mosaicRegion(source, x, y, w, h, block) {
  const cols = Math.max(1, Math.round(w / block))
  const rows = Math.max(1, Math.round(h / block))
  const small = createCanvas(cols, rows)
  const sctx = small.getContext('2d')
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(source, x, y, w, h, 0, 0, cols, rows)

  const out = createCanvas(w, h)
  const octx = out.getContext('2d')
  octx.imageSmoothingEnabled = false
  octx.drawImage(small, 0, 0, w, h)
  releaseCanvas(small)
  return out
}

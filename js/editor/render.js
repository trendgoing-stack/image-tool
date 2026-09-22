/**
 * 加工リストを canvas に適用する。プレビュー（縮小画像）と保存（元の解像度）で同じ関数を使う。
 *
 * 加工の座標・大きさは画像に対する割合で持つ（解像度によらない）：
 *   範囲（四角）: { kind: 'area', effect, shape: 'rect', x, y, w, h }         … 0〜1
 *   範囲（ブラシ）: { kind: 'area', effect, shape: 'brush', points: [[x, y], …], brush }
 *                   brush はブラシの太さ（短辺に対する割合）
 *   effect: 'blur' | 'mosaic' | 'fill'、strength: 1〜10（ぼかし・モザイク）、color（塗りつぶし）
 *   文字: { kind: 'text', … }（text.js を参照）
 *
 * 文字は常に、ぼかし・モザイク・塗りつぶしの上に描く。
 */
import { createCanvas, releaseCanvas } from '../core/limits.js'
import { blurImageData } from './stackblur.js'
import { mosaicRegion } from './mosaic.js'
import { drawText } from './text.js'

export const STRENGTH_MIN = 1
export const STRENGTH_MAX = 10

/**
 * ぼかしの半径（px）。最低強度でも文字や顔が判読しにくい強さを下限にしている。
 * 短辺の 1.5%（強度1）〜 6%（強度10）。ガウスぼかしの標準偏差に相当する
 */
export function blurRadiusPx(strength, minSide) {
  return Math.max(6, minSide * (0.015 + 0.005 * (strength - 1)))
}

/** モザイクのブロックの大きさ（px）。短辺の 2.5%（強度1）〜 8%（強度10） */
export function mosaicBlockPx(strength, minSide) {
  return Math.max(8, minSide * (0.025 + 0.006 * (strength - 1)))
}

/** ぼかしは縮小してからかけると速い。この半径を超える場合は縮小して計算する */
const BLUR_WORK_RADIUS = 16

function areaBounds(op, width, height) {
  const minSide = Math.min(width, height)
  let x0
  let y0
  let x1
  let y1
  if (op.shape === 'rect') {
    x0 = op.x * width
    y0 = op.y * height
    x1 = (op.x + op.w) * width
    y1 = (op.y + op.h) * height
  } else {
    const half = (op.brush * minSide) / 2
    const xs = op.points.map((p) => p[0] * width)
    const ys = op.points.map((p) => p[1] * height)
    x0 = Math.min(...xs) - half
    y0 = Math.min(...ys) - half
    x1 = Math.max(...xs) + half
    y1 = Math.max(...ys) + half
  }
  x0 = Math.max(0, Math.floor(x0))
  y0 = Math.max(0, Math.floor(y0))
  x1 = Math.min(width, Math.ceil(x1))
  y1 = Math.min(height, Math.ceil(y1))
  if (x1 - x0 < 1 || y1 - y0 < 1) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** 範囲 (b) に効果をかけた画像を作る（大きさ b.w×b.h） */
function effectCanvas(canvas, op, b) {
  const minSide = Math.min(canvas.width, canvas.height)
  if (op.effect === 'fill') {
    const out = createCanvas(b.w, b.h)
    const ctx = out.getContext('2d')
    ctx.fillStyle = op.color
    ctx.fillRect(0, 0, b.w, b.h)
    return out
  }
  if (op.effect === 'mosaic') {
    return mosaicRegion(canvas, b.x, b.y, b.w, b.h, mosaicBlockPx(op.strength, minSide))
  }

  // ぼかし：範囲の外側の画素も使ってぼかすため、半径の分だけ広げて計算する
  const radius = blurRadiusPx(op.strength, minSide)
  const pad = Math.ceil(radius * 3)
  const px0 = Math.max(0, b.x - pad)
  const py0 = Math.max(0, b.y - pad)
  const px1 = Math.min(canvas.width, b.x + b.w + pad)
  const py1 = Math.min(canvas.height, b.y + b.h + pad)
  const scale = Math.min(1, BLUR_WORK_RADIUS / radius)
  const sw = Math.max(1, Math.round((px1 - px0) * scale))
  const sh = Math.max(1, Math.round((py1 - py0) * scale))
  const small = createCanvas(sw, sh)
  const sctx = small.getContext('2d', { willReadFrequently: true })
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(canvas, px0, py0, px1 - px0, py1 - py0, 0, 0, sw, sh)
  const data = sctx.getImageData(0, 0, sw, sh)
  blurImageData(data, radius * scale)
  sctx.putImageData(data, 0, 0)

  const out = createCanvas(b.w, b.h)
  const octx = out.getContext('2d')
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(small, 0, 0, sw, sh, px0 - b.x, py0 - b.y, px1 - px0, py1 - py0)
  releaseCanvas(small)
  return out
}

/** ブラシの軌跡を、範囲 b の左上を原点として描く */
function strokeBrush(ctx, op, b, width, height) {
  const lineWidth = op.brush * Math.min(width, height)
  const pts = op.points.map(([x, y]) => [x * width - b.x, y * height - b.y])
  if (pts.length === 1) {
    ctx.beginPath()
    ctx.arc(pts[0][0], pts[0][1], lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.stroke()
}

/** ぼかし・モザイク・塗りつぶしを 1つ適用する */
export function applyAreaOp(canvas, op) {
  const b = areaBounds(op, canvas.width, canvas.height)
  if (!b) return
  const effect = effectCanvas(canvas, op, b)
  if (op.shape === 'brush') {
    // ブラシの形に切り抜く
    const ectx = effect.getContext('2d')
    ectx.globalCompositeOperation = 'destination-in'
    ectx.fillStyle = '#000'
    ectx.strokeStyle = '#000'
    strokeBrush(ectx, op, b, canvas.width, canvas.height)
  }
  const ctx = canvas.getContext('2d')
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(effect, b.x, b.y)
  ctx.restore()
  releaseCanvas(effect)
}

/** 画面表示用：ブラシの軌跡を、画像全体の座標でなぞる（操作中の目印に使う） */
export function traceBrush(ctx, op, width, height) {
  strokeBrush(ctx, op, { x: 0, y: 0 }, width, height)
}

export function drawTexts(canvas, ops) {
  const ctx = canvas.getContext('2d')
  for (const op of ops) if (op.kind === 'text') drawText(ctx, op, canvas.width, canvas.height)
}

/** 加工リスト全体を適用する（範囲の加工を順に → 文字を順に） */
export function renderEdits(canvas, ops) {
  for (const op of ops) if (op.kind === 'area') applyAreaOp(canvas, op)
  drawTexts(canvas, ops)
}

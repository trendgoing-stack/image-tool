/**
 * 文字入れの描画と当たり判定。
 * 位置・大きさは画像に対する割合で持つので、プレビューと保存で同じ見た目になる。
 *   x, y  : 文字のかたまりの中心（画像の幅・高さに対する 0〜1）
 *   size  : 文字の大きさ（画像の短辺に対する割合）
 *   strokeWidth : 縁取りの太さ（文字の大きさに対する割合、0 で縁取りなし）
 */

/** システムフォントのみ（Webフォントは同梱しない） */
export const FONTS = [
  { id: 'gothic-bold', label: 'ゴシック（太）', weight: 'bold', family: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif' },
  { id: 'gothic', label: 'ゴシック', weight: 'normal', family: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif' },
  { id: 'mincho', label: '明朝', weight: 'normal', family: '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif' },
  { id: 'mincho-bold', label: '明朝（太）', weight: 'bold', family: '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif' },
  { id: 'mono', label: '等幅', weight: 'normal', family: 'ui-monospace, Menlo, Consolas, "Courier New", monospace' },
]

const LINE_HEIGHT = 1.25
const BAND_PADDING = 0.3 // 背景帯の余白（文字の大きさに対する割合）
const BAND_COLOR = 'rgba(0, 0, 0, 0.5)'

export function fontOf(op, px) {
  const font = FONTS.find((f) => f.id === op.font) ?? FONTS[0]
  return `${font.weight} ${px}px ${font.family}`
}

function layout(ctx, op, width, height) {
  const px = Math.max(1, op.size * Math.min(width, height))
  ctx.font = fontOf(op, px)
  const lines = String(op.text).split('\n')
  const widths = lines.map((line) => ctx.measureText(line).width)
  const blockW = Math.max(1, ...widths)
  const blockH = lines.length * px * LINE_HEIGHT
  const cx = op.x * width
  const cy = op.y * height
  return { px, lines, blockW, blockH, cx, cy, left: cx - blockW / 2, top: cy - blockH / 2 }
}

/** 文字が占める範囲（背景帯・縁取りを含む）を canvas の画素座標で返す */
export function textBounds(ctx, op, width, height) {
  const l = layout(ctx, op, width, height)
  const pad = op.band ? l.px * BAND_PADDING : (op.strokeWidth || 0) * l.px
  return { x: l.left - pad, y: l.top - pad, w: l.blockW + pad * 2, h: l.blockH + pad * 2 }
}

export function drawText(ctx, op, width, height) {
  if (!String(op.text).trim()) return
  const l = layout(ctx, op, width, height)
  ctx.save()
  if (op.band) {
    const pad = l.px * BAND_PADDING
    ctx.fillStyle = BAND_COLOR
    ctx.fillRect(l.left - pad, l.top - pad, l.blockW + pad * 2, l.blockH + pad * 2)
  }
  ctx.font = fontOf(op, l.px)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  l.lines.forEach((line, i) => {
    const y = l.top + l.px * LINE_HEIGHT * (i + 0.5)
    if (op.strokeWidth > 0) {
      // 線の半分は文字の内側に重なるため、太さを 2倍にして外側に指定の太さを出す
      ctx.lineWidth = op.strokeWidth * l.px * 2
      ctx.strokeStyle = op.strokeColor
      ctx.strokeText(line, l.cx, y)
    }
    ctx.fillStyle = op.color
    ctx.fillText(line, l.cx, y)
  })
  ctx.restore()
}

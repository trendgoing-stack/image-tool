/**
 * 切り取り枠の操作と描画。
 * 枠は、回転・反転したあとの画像全体に対する割合 { x, y, w, h }（0〜1）で扱う。
 * 比率は画素での「幅 ÷ 高さ」で指定し、内部では割合の座標での比率に直して計算する。
 */

/** 比率の選択肢。note は用途の目安（SNS の推奨比率は変わることがある） */
export const CROP_RATIOS = [
  { id: 'free', label: '自由', note: '好きな形に切り取る', ratio: null },
  { id: 'original', label: '元の比率', note: '写真と同じ形で範囲をしぼる', ratio: 'original' },
  { id: '1:1', label: '1:1', note: 'Instagram投稿・プロフィール画像', ratio: 1 },
  { id: '4:3', label: '4:3', note: '一般的な横長の写真・ブログ', ratio: 4 / 3 },
  { id: '3:4', label: '3:4', note: 'iPhoneの縦写真と同じ形', ratio: 3 / 4 },
  { id: '16:9', label: '16:9', note: 'YouTubeサムネイル・Xの横長・PC画面', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', note: 'ストーリーズ・リール・TikTok・壁紙', ratio: 9 / 16 },
]

/** 90°回転したときに対応する比率 */
export const TRANSPOSED_RATIO = { '4:3': '3:4', '3:4': '4:3', '16:9': '9:16', '9:16': '16:9' }

/** 枠の大きさの最小値（画面上の px） */
const MIN_SIZE_PX = 40
/** 四隅・辺をつかめる距離（画面上の px） */
const HANDLE_HIT_PX = 28

/**
 * 画素での比率を、割合の座標での比率（w / h）に直す。
 * @param {string} ratioId CROP_RATIOS の id
 * @param {number} fullW 回転後の画像全体の幅（任意の単位）
 * @param {number} fullH 回転後の画像全体の高さ
 * @returns {number | null} null は比率を固定しない
 */
export function normalizedRatio(ratioId, fullW, fullH) {
  const r = CROP_RATIOS.find((x) => x.id === ratioId)?.ratio
  if (!r) return null
  if (r === 'original') return 1
  return (r * fullH) / fullW
}

/** 指定の比率で、画像全体に収まる最大の枠（中央） */
export function largestCenteredRect(rn) {
  if (!rn) return { x: 0, y: 0, w: 1, h: 1 }
  let w = 1
  let h = 1 / rn
  if (h > 1) {
    h = 1
    w = rn
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

/**
 * 画面上のどこをつかんだか。
 * @param {object} r 枠（割合）
 * @param {number} px つかんだ位置（割合）
 * @param {number} py
 * @param {{ width: number, height: number }} css 画面上の表示サイズ（px）
 * @param {boolean} locked 比率を固定しているか（固定中は辺ではなく四隅だけ）
 * @returns {string | null} 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'move' | null
 */
export function hitHandle(r, px, py, css, locked) {
  const tx = HANDLE_HIT_PX / css.width
  const ty = HANDLE_HIT_PX / css.height
  const nearL = Math.abs(px - r.x) <= tx
  const nearR = Math.abs(px - (r.x + r.w)) <= tx
  const nearT = Math.abs(py - r.y) <= ty
  const nearB = Math.abs(py - (r.y + r.h)) <= ty
  const inX = px >= r.x - tx && px <= r.x + r.w + tx
  const inY = py >= r.y - ty && py <= r.y + r.h + ty
  if (nearT && nearL) return 'nw'
  if (nearT && nearR) return 'ne'
  if (nearB && nearL) return 'sw'
  if (nearB && nearR) return 'se'
  if (!locked) {
    if (nearT && inX) return 'n'
    if (nearB && inX) return 's'
    if (nearL && inY) return 'w'
    if (nearR && inY) return 'e'
  }
  if (px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h) return 'move'
  return null
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))

/**
 * つかんだ部分をドラッグしたあとの枠。
 * @param {object} start ドラッグ開始時の枠
 * @param {string} handle hitHandle の結果
 * @param {number} dx ドラッグ量（割合）
 * @param {number} dy
 * @param {number | null} rn 割合での比率（w / h）。null は固定しない
 * @param {{ width: number, height: number }} css 画面上の表示サイズ（最小サイズの計算用）
 */
export function dragCrop(start, handle, dx, dy, rn, css) {
  const minW = Math.min(1, MIN_SIZE_PX / css.width)
  const minH = Math.min(1, MIN_SIZE_PX / css.height)

  if (handle === 'move') {
    return {
      ...start,
      x: Math.min(1 - start.w, Math.max(0, start.x + dx)),
      y: Math.min(1 - start.h, Math.max(0, start.y + dy)),
    }
  }

  let x0 = start.x
  let y0 = start.y
  let x1 = start.x + start.w
  let y1 = start.y + start.h

  if (handle.length === 1) {
    // 辺（比率を固定していないときだけ）
    if (handle === 'n') y0 = Math.min(clamp01(y0 + dy), y1 - minH)
    if (handle === 's') y1 = Math.max(clamp01(y1 + dy), y0 + minH)
    if (handle === 'w') x0 = Math.min(clamp01(x0 + dx), x1 - minW)
    if (handle === 'e') x1 = Math.max(clamp01(x1 + dx), x0 + minW)
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }

  // 四隅：反対側の角を固定して大きさを変える
  const west = handle.includes('w')
  const north = handle.includes('n')
  const ax = west ? x1 : x0
  const ay = north ? y1 : y0
  const cx = clamp01((west ? x0 : x1) + dx)
  const cy = clamp01((north ? y0 : y1) + dy)
  let w = Math.max(minW, west ? ax - cx : cx - ax)
  let h = Math.max(minH, north ? ay - cy : cy - ay)
  // 固定した角から画像の端までに収める
  const maxW = west ? ax : 1 - ax
  const maxH = north ? ay : 1 - ay
  w = Math.min(w, maxW)
  h = Math.min(h, maxH)
  if (rn) {
    // 比率を保つ：はみ出さないよう、小さいほうに合わせる
    if (w / h > rn) w = h * rn
    else h = w / rn
  }
  return { x: west ? ax - w : ax, y: north ? ay - h : ay, w, h }
}

/**
 * 切り取り枠を描く（枠の外を暗くし、三分割線と四隅のつまみを付ける）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} r 枠（割合）
 * @param {number} W canvas の幅
 * @param {number} H canvas の高さ
 * @param {number} lineScale canvas の 1px が画面上で何 px か の逆数
 */
export function drawCropFrame(ctx, r, W, H, lineScale) {
  const x = r.x * W
  const y = r.y * H
  const w = r.w * W
  const h = r.h * H
  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  ctx.rect(x, y, w, h)
  ctx.fill('evenodd')

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 1 * lineScale
  ctx.beginPath()
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(x + (w * i) / 3, y)
    ctx.lineTo(x + (w * i) / 3, y + h)
    ctx.moveTo(x, y + (h * i) / 3)
    ctx.lineTo(x + w, y + (h * i) / 3)
  }
  ctx.stroke()

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2 * lineScale
  ctx.strokeRect(x, y, w, h)

  // 四隅のつまみ（L字）
  const len = Math.min(22 * lineScale, w / 3, h / 3)
  ctx.lineWidth = 5 * lineScale
  ctx.lineCap = 'square'
  ctx.beginPath()
  for (const [cx, cy, sx, sy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ]) {
    ctx.moveTo(cx + sx * len, cy)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx, cy + sy * len)
  }
  ctx.stroke()
  ctx.restore()
}

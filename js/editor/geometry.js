/**
 * 回転・反転・切り取り（ジオメトリ）と座標変換。
 *
 * 回転・反転は 2×2 の行列 { a, b, c, d }（成分は -1 / 0 / 1）で表す。
 * 元の画像の中心を原点とした座標 (X, Y) を、変換後の画像の中心を原点とした座標に移す：
 *   x' = a·X + c·Y,  y' = b·X + d·Y      （canvas の transform(a, b, c, d) と同じ並び）
 * 切り取り範囲 crop は、回転・反転したあとの画像全体に対する割合 { x, y, w, h }（0〜1）。
 *
 * 加工（ぼかし・文字など）の座標は「元の画像」に対する割合で記録する。
 * こうしておくと、あとから回転・切り取りをしても、加工は写真の同じ場所に残る。
 */

export const FULL_CROP = Object.freeze({ x: 0, y: 0, w: 1, h: 1 })

export function identityGeometry() {
  return { a: 1, b: 0, c: 0, d: 1, crop: FULL_CROP }
}

export function isFullCrop(c) {
  return c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1
}

export function isIdentityGeometry(g) {
  return g.a === 1 && g.b === 0 && g.c === 0 && g.d === 1 && isFullCrop(g.crop)
}

/** 90°/270° 回転していると縦横が入れ替わる */
export function isSwapped(g) {
  return g.a === 0
}

/** 回転・反転したあとの画像全体の大きさ */
export function transformedSize(g, w0, h0) {
  return isSwapped(g) ? { width: h0, height: w0 } : { width: w0, height: h0 }
}

/** 切り取ったあとの大きさ（元の画像の画素単位、小数あり） */
export function croppedSize(g, w0, h0) {
  const t = transformedSize(g, w0, h0)
  return { width: g.crop.w * t.width, height: g.crop.h * t.height }
}

// 画面で見たときの操作を、今の行列の「左から」掛けて合成する
function compose(g, m, cropFn) {
  const [p, q, r, s] = m // [[p, r], [q, s]]
  return {
    a: p * g.a + r * g.b,
    b: q * g.a + s * g.b,
    c: p * g.c + r * g.d,
    d: q * g.c + s * g.d,
    crop: cropFn(g.crop),
  }
}

/** 右（時計回り）に 90° */
export function rotateRight(g) {
  return compose(g, [0, 1, -1, 0], (c) => ({ x: 1 - (c.y + c.h), y: c.x, w: c.h, h: c.w }))
}

/** 左（反時計回り）に 90° */
export function rotateLeft(g) {
  return compose(g, [0, -1, 1, 0], (c) => ({ x: c.y, y: 1 - (c.x + c.w), w: c.h, h: c.w }))
}

/** 左右反転（画面で見て） */
export function flipHorizontal(g) {
  return compose(g, [-1, 0, 0, 1], (c) => ({ ...c, x: 1 - c.x - c.w }))
}

/** 上下反転（画面で見て） */
export function flipVertical(g) {
  return compose(g, [1, 0, 0, -1], (c) => ({ ...c, y: 1 - c.y - c.h }))
}

/**
 * 元の画像の座標と、canvas 上の画素座標を相互に変換する「ビュー」を作る。
 * @param {object} g ジオメトリ
 * @param {number} w0 元の画像（向き反映後）の幅
 * @param {number} h0 元の画像の高さ
 * @param {number} scale canvas の 1px が元の画像の何 px に当たるかの逆数（canvas px / 元の px）
 * @param {{ ignoreCrop?: boolean }} [options] ignoreCrop: 切り取り前の全体を表示する（切り取り操作中）
 */
export function makeView(g, w0, h0, scale, options = {}) {
  const t = transformedSize(g, w0, h0)
  const crop = options.ignoreCrop ? FULL_CROP : g.crop
  const offX = crop.x * t.width
  const offY = crop.y * t.height
  return {
    geometry: g,
    crop,
    scale,
    width: Math.max(1, Math.round(crop.w * t.width * scale)),
    height: Math.max(1, Math.round(crop.h * t.height * scale)),
    /** 元の画像の短辺が canvas 上で何 px か（加工の大きさの基準） */
    unit: Math.min(w0, h0) * scale,
    /** 元の画像に対する割合 (u, v) → canvas の画素 */
    toPx(u, v) {
      const X = (u - 0.5) * w0
      const Y = (v - 0.5) * h0
      return [(g.a * X + g.c * Y + t.width / 2 - offX) * scale, (g.b * X + g.d * Y + t.height / 2 - offY) * scale]
    },
    /** canvas の画素 → 元の画像に対する割合 (u, v) */
    fromPx(px, py) {
      const x = px / scale + offX - t.width / 2
      const y = py / scale + offY - t.height / 2
      // 回転・反転の行列は直交行列なので、逆行列は転置
      return [(g.a * x + g.b * y) / w0 + 0.5, (g.c * x + g.d * y) / h0 + 0.5]
    },
    /** 元の画像（source）を、このビューの canvas に描く */
    drawSource(ctx, source) {
      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.translate(t.width / 2 - offX, t.height / 2 - offY)
      ctx.transform(g.a, g.b, g.c, g.d, 0, 0)
      ctx.drawImage(source, -w0 / 2, -h0 / 2, w0, h0)
      ctx.restore()
    },
  }
}

/** 元の画像に対する割合の四角 → canvas 上の四角（回転・反転しても軸に平行なまま） */
export function rectToPx(view, r) {
  const [x0, y0] = view.toPx(r.x, r.y)
  const [x1, y1] = view.toPx(r.x + r.w, r.y + r.h)
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }
}

/** canvas 上の四角 → 元の画像に対する割合の四角 */
export function rectFromPx(view, r) {
  const [u0, v0] = view.fromPx(r.x, r.y)
  const [u1, v1] = view.fromPx(r.x + r.w, r.y + r.h)
  return { x: Math.min(u0, u1), y: Math.min(v0, v1), w: Math.abs(u1 - u0), h: Math.abs(v1 - v0) }
}

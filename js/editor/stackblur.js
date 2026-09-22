/**
 * ぼかし（ctx.filter を使わない自前実装）。
 * Stack Blur と同じ考え方で、累積和による箱型ぼかしを縦横に 3回ずつかけてガウスぼかしに近づける。
 * 計算量は半径によらず画素数に比例する。
 */

/** 1行（または1列）分の箱型ぼかし。端は端の画素を繰り返したものとして扱う */
function boxBlurLine(src, dst, start, step, length, radius) {
  const window = radius * 2 + 1
  for (let c = 0; c < 4; c++) {
    let sum = 0
    // 最初の窓：左端より外は端の画素
    for (let i = -radius; i <= radius; i++) {
      const idx = Math.min(length - 1, Math.max(0, i))
      sum += src[start + idx * step + c]
    }
    for (let i = 0; i < length; i++) {
      dst[start + i * step + c] = Math.round(sum / window)
      const outIdx = Math.max(0, i - radius)
      const inIdx = Math.min(length - 1, i + radius + 1)
      sum += src[start + inIdx * step + c] - src[start + outIdx * step + c]
    }
  }
}

/**
 * ImageData をその場でぼかす。
 * @param {ImageData} imageData
 * @param {number} radius 画素単位の半径（1以上）
 */
export function blurImageData(imageData, radius) {
  const r = Math.max(1, Math.round(radius))
  const { width, height, data } = imageData
  const tmp = new Uint8ClampedArray(data.length)
  // 半径 r の箱型ぼかしを 3回かけると、標準偏差がおよそ r のガウスぼかしになる
  const passRadius = r
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < height; y++) boxBlurLine(data, tmp, y * width * 4, 4, width, passRadius)
    for (let x = 0; x < width; x++) boxBlurLine(tmp, data, x * 4, width * 4, height, passRadius)
  }
}

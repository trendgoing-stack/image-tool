/**
 * 処理前後の拡大比較。境目を左右に動かして見比べる。
 * 大きな画像は開いている間だけ読み込み、閉じたら ObjectURL を解放する。
 */
const $ = (id) => document.getElementById(id)

let urls = []

function setPosition(percent) {
  const p = Math.min(100, Math.max(0, percent))
  $('compare-slider').value = String(p)
  $('compare-before').style.clipPath = `inset(0 ${100 - p}% 0 0)`
  $('compare-divider').style.left = `${p}%`
}

function close() {
  $('compare').hidden = true
  document.documentElement.style.overflow = ''
  for (const img of [$('compare-before'), $('compare-after')]) img.removeAttribute('src')
  for (const url of urls) URL.revokeObjectURL(url)
  urls = []
}

/**
 * @param {File} file 元のファイル
 * @param {{ name: string, blob: Blob, width: number, height: number, srcWidth: number, srcHeight: number }} result
 */
export function openCompare(file, result) {
  close()
  const beforeUrl = URL.createObjectURL(file)
  const afterUrl = URL.createObjectURL(result.blob)
  urls = [beforeUrl, afterUrl]
  $('compare-before').src = beforeUrl
  $('compare-after').src = afterUrl
  $('compare-title').textContent = result.name
  $('compare-info').textContent = `処理前 ${result.srcWidth}×${result.srcHeight} ／ 処理後 ${result.width}×${result.height}　（画面の大きさに合わせて表示しています）`
  setPosition(50)
  $('compare').hidden = false
  document.documentElement.style.overflow = 'hidden'
}

export function initCompare() {
  $('compare-close').addEventListener('click', close)
  $('compare-slider').addEventListener('input', (e) => setPosition(Number(e.target.value)))

  // 画像の上を指でなぞっても境目を動かせるようにする
  const stage = $('compare-stage')
  const move = (e) => {
    const rect = stage.getBoundingClientRect()
    setPosition(((e.clientX - rect.left) / rect.width) * 100)
  }
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId)
    move(e)
  })
  stage.addEventListener('pointermove', (e) => {
    if (stage.hasPointerCapture(e.pointerId)) move(e)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('compare').hidden) close()
  })
}

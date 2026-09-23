/**
 * 1枚編集モードの画面：回転・反転・切り取り、ぼかし・モザイク・塗りつぶし・文字入れ。
 *
 * 編集は縮小したプレビュー上で行う。加工は「元の画像」に対する割合の座標で記録し（ops.js / render.js）、
 * 回転・切り取りは geometry.js の形で記録する。保存時は pipeline.js が元の写真に同じ編集を適用する。
 *
 * 画面は 2枚の canvas を重ねている：
 *   edit-canvas  … 画像＋加工の結果
 *   edit-overlay … 操作中の枠やブラシの軌跡、選択中の文字の枠、切り取り枠（保存結果には含まれない）
 *
 * 「回転・切取」ツールのときは切り取り前の全体を表示し、それ以外のツールでは切り取ったあとを表示する。
 */
import { decodeImage } from '../core/decode.js'
import { drawResized } from '../core/resize.js'
import { clampToCanvasLimit, createCanvas, releaseCanvas } from '../core/limits.js'
import { EditHistory, newId } from './ops.js'
import { applyAreaOp, drawTexts, traceBrush } from './render.js'
import { FONTS, textBounds } from './text.js'
import {
  FULL_CROP,
  croppedSize,
  flipHorizontal,
  flipVertical,
  isFullCrop,
  isIdentityGeometry,
  makeView,
  rectFromPx,
  rotateLeft,
  rotateRight,
  transformedSize,
} from './geometry.js'
import {
  CROP_RATIOS,
  TRANSPOSED_RATIO,
  dragCrop,
  drawCropFrame,
  hitHandle,
  largestCenteredRect,
  normalizedRatio,
} from './crop.js'
import { showToast } from '../ui/toast.js'

const $ = (id) => document.getElementById(id)

/** プレビューの長辺の上限（px）。保存時は元の解像度で処理する */
const PREVIEW_MAX_EDGE = 2048
/** 四角の範囲として扱う最小の大きさ（表示している範囲に対する割合）。誤タップで小さな加工ができないように */
const MIN_RECT = 0.01

const history = new EditHistory()
let file = null
let srcW = 0 // 元の画像（向き反映後）の大きさ
let srcH = 0
let sourcePreview = null // 元の画像を縮小したもの（回転・切り取り前）
let previewScale = 1 // sourcePreview の 1px が元の画像の何 px か の逆数
let view = null // 今の表示（geometry.js の makeView）
let viewKey = ''
let base = null // 今の表示での加工前の画像
let areaCache = null // base に範囲の加工を適用したもの
let areaOpsInCache = [] // areaCache に適用済みの加工
let selectedId = null
let gesture = null
let cropRatio = 'free'
const pointers = new Map()
let lastTextStyle = {
  font: 'gothic-bold',
  frameSize: 0.08, // 表示している範囲の短辺に対する割合
  color: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 0.08,
  band: false,
}

const canvas = () => $('edit-canvas')
const overlay = () => $('edit-overlay')

function radioValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value
}

function currentTool() {
  return radioValue('edit-tool')
}

function selectedText() {
  return history.ops.find((op) => op.id === selectedId && op.kind === 'text') ?? null
}

/** 表示している範囲の短辺（canvas px）が、元の画像の短辺の何倍か（文字・ブラシの大きさの換算用） */
function frameRatio() {
  return Math.min(view.width, view.height) / view.unit
}

// ---- 表示の準備 ----

/** 回転・切り取りやツールが変わったら、表示用の canvas を作り直す */
function syncView() {
  const g = history.geometry
  const ignoreCrop = currentTool() === 'crop'
  const key = JSON.stringify([g, ignoreCrop])
  if (key === viewKey && base) return
  viewKey = key
  view = makeView(g, srcW, srcH, previewScale, { ignoreCrop })

  releaseCanvas(base)
  releaseCanvas(areaCache)
  base = createCanvas(view.width, view.height)
  view.drawSource(base.getContext('2d'), sourcePreview)
  areaCache = createCanvas(view.width, view.height)
  areaCache.getContext('2d').drawImage(base, 0, 0)
  areaOpsInCache = []

  for (const c of [canvas(), overlay()]) {
    c.width = view.width
    c.height = view.height
  }
  const stage = $('editor-stage')
  stage.style.aspectRatio = `${view.width} / ${view.height}`
  // 縦長の画像でも画面に収まるように、高さを画面の 6割程度までにする
  stage.style.maxWidth = `min(100%, calc(60vh * ${view.width / view.height}))`
}

// ---- 描画 ----

/** 範囲の加工が変わったときだけ areaCache を作り直す（末尾に 1つ増えただけなら追加分だけ適用） */
function syncAreaCache() {
  const areaOps = history.ops.filter((op) => op.kind === 'area')
  const same = areaOps.length >= areaOpsInCache.length && areaOpsInCache.every((op, i) => op === areaOps[i])
  if (same && areaOps.length === areaOpsInCache.length) return
  if (!same) {
    const ctx = areaCache.getContext('2d')
    ctx.clearRect(0, 0, areaCache.width, areaCache.height)
    ctx.drawImage(base, 0, 0)
    areaOpsInCache = []
  }
  for (const op of areaOps.slice(areaOpsInCache.length)) applyAreaOp(areaCache, op, view)
  areaOpsInCache = areaOps
}

function renderMain() {
  syncAreaCache()
  const c = canvas()
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.drawImage(areaCache, 0, 0)
  drawTexts(c, history.ops, view)
}

function renderOverlay() {
  const o = overlay()
  const ctx = o.getContext('2d')
  ctx.clearRect(0, 0, o.width, o.height)
  const lineScale = o.width / o.getBoundingClientRect().width || 1

  if (currentTool() === 'crop') {
    drawCropFrame(ctx, gesture?.type === 'crop' ? gesture.rect : history.geometry.crop, o.width, o.height, lineScale)
    return
  }

  ctx.lineWidth = 2 * lineScale
  ctx.setLineDash([6 * lineScale, 4 * lineScale])
  if (gesture?.type === 'rect') {
    const r = pxRect(gesture)
    ctx.fillStyle = 'rgba(10, 132, 255, 0.2)'
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeStyle = '#ffffff'
    ctx.strokeRect(r.x, r.y, r.w, r.h)
  } else if (gesture?.type === 'brush') {
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(10, 132, 255, 0.5)'
    ctx.fillStyle = 'rgba(10, 132, 255, 0.5)'
    traceBrush(ctx, { points: gesture.points, brush: brushSize() }, view)
  }

  const text = selectedText()
  if (text) {
    const b = textBounds(canvas().getContext('2d'), text, view)
    const pad = 6 * lineScale
    ctx.strokeStyle = '#0a84ff'
    ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2)
  }
}

function render() {
  if (!sourcePreview) return
  syncView()
  renderMain()
  renderOverlay()
  updateControls()
}

// ---- 操作パネル ----

function strength() {
  return Number($('edit-strength').value)
}

/** ブラシの太さ（元の画像の短辺に対する割合）。スライダーは表示している範囲の短辺に対する % */
function brushSize() {
  return (Number($('edit-brush').value) / 100) * frameRatio()
}

function updateControls() {
  $('edit-undo').disabled = !history.canUndo
  $('edit-redo').disabled = !history.canRedo
  $('edit-reset').disabled = history.ops.length === 0 && isIdentityGeometry(history.geometry)

  const tool = currentTool()
  const shape = radioValue('edit-shape')
  const isText = tool === 'text'
  const isCrop = tool === 'crop'
  $('crop-options').hidden = !isCrop
  $('area-options').hidden = isText || isCrop
  $('text-options').hidden = !isText
  $('strength-row').hidden = tool === 'fill'
  $('fill-color-row').hidden = tool !== 'fill'
  $('brush-row').hidden = shape !== 'brush'
  $('edit-strength-value').textContent = String(strength())
  $('edit-brush-value').textContent = `${$('edit-brush').value}%`
  $('area-hint').textContent =
    shape === 'rect' ? '画像の上を斜めにドラッグして、範囲を四角で囲みます' : '隠したい部分を指でなぞります'

  if (isCrop && srcW) {
    for (const btn of $('crop-ratios').querySelectorAll('button')) {
      btn.setAttribute('aria-checked', String(btn.dataset.id === cropRatio))
    }
    const size = croppedSize(history.geometry, srcW, srcH)
    $('crop-size').textContent = `切り取り後：${Math.round(size.width)}×${Math.round(size.height)} px`
    $('crop-reset').disabled = isFullCrop(history.geometry.crop)
  }

  const text = isText && view ? selectedText() : null
  $('text-panel').hidden = !text
  $('text-none').hidden = Boolean(text)
  if (text) {
    // 入力中の欄を上書きしないように、値が違うときだけ反映する
    const sizePct = Math.round((text.size / frameRatio()) * 200) / 2
    setValue('text-content', text.text)
    setValue('text-font', text.font)
    setValue('text-size', String(sizePct))
    setValue('text-color', text.color)
    setValue('text-stroke-color', text.strokeColor)
    setValue('text-stroke-width', String(Math.round(text.strokeWidth * 100)))
    $('text-band').checked = text.band
    $('text-size-value').textContent = `${sizePct}%`
    $('text-stroke-width-value').textContent = text.strokeWidth > 0 ? `${Math.round(text.strokeWidth * 100)}%` : 'なし'
  }
}

function setValue(id, value) {
  const el = $(id)
  if (el.value !== value) el.value = value
}

function select(id) {
  selectedId = id
  const text = selectedText()
  if (text) {
    const { font, color, strokeColor, strokeWidth, band } = text
    lastTextStyle = { font, frameSize: text.size / frameRatio(), color, strokeColor, strokeWidth, band }
  }
}

/**
 * 選択中の文字を変更する。
 * mergeKey を指定すると、同じ種類の連続した操作（入力・スライダー・ドラッグ）を 1回の Undo にまとめる。
 */
function updateSelectedText(changes, mergeKey = null) {
  const text = selectedText()
  if (!text) return
  history.update(text.id, changes, mergeKey && `${mergeKey}:${text.id}`)
  select(text.id)
  renderMain()
  renderOverlay()
  updateControls()
}

// ---- 回転・切り取り ----

function applyGeometry(next, { transpose = false } = {}) {
  if (transpose && TRANSPOSED_RATIO[cropRatio]) cropRatio = TRANSPOSED_RATIO[cropRatio]
  history.commitGeometry(next)
  render()
}

/** 比率を選ぶ：その比率で画像全体に収まる最大の枠にする */
function chooseRatio(id) {
  cropRatio = id
  const g = history.geometry
  if (id !== 'free') {
    const t = transformedSize(g, srcW, srcH)
    history.commitGeometry({ ...g, crop: largestCenteredRect(normalizedRatio(id, t.width, t.height)) })
  }
  render()
}

/** 戻す・やり直すで枠が変わったとき、選んでいる比率と枠の形が合わなくなったら「自由」に戻す */
function syncRatioWithCrop() {
  const rn = lockedRatio()
  if (!rn) return
  const c = history.geometry.crop
  if (Math.abs(c.w / c.h / rn - 1) > 0.01) cropRatio = 'free'
}

function lockedRatio() {
  const t = transformedSize(history.geometry, srcW, srcH)
  return normalizedRatio(cropRatio, t.width, t.height)
}

// ---- タッチ操作 ----

/** 画面上の位置 → canvas の画素（範囲外は端に寄せる） */
function toPx(e) {
  const rect = overlay().getBoundingClientRect()
  return {
    x: Math.min(view.width, Math.max(0, ((e.clientX - rect.left) / rect.width) * view.width)),
    y: Math.min(view.height, Math.max(0, ((e.clientY - rect.top) / rect.height) * view.height)),
  }
}

function pxRect(g) {
  return {
    x: Math.min(g.x0, g.x1),
    y: Math.min(g.y0, g.y1),
    w: Math.abs(g.x1 - g.x0),
    h: Math.abs(g.y1 - g.y0),
  }
}

function hitText(p) {
  const ctx = canvas().getContext('2d')
  const texts = history.ops.filter((op) => op.kind === 'text')
  const pad = view.width * 0.02
  // 後から追加したもの（上に描かれているもの）を優先する
  for (let i = texts.length - 1; i >= 0; i--) {
    const b = textBounds(ctx, texts[i], view)
    if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) return texts[i]
  }
  return null
}

function pinchDistance() {
  const [a, b] = [...pointers.values()]
  const rect = overlay().getBoundingClientRect()
  return Math.hypot(((a.x - b.x) / view.width) * rect.width, ((a.y - b.y) / view.height) * rect.height)
}

function onPointerDown(e) {
  if (!view) return
  e.preventDefault()
  try {
    // 指が画像の外に出ても操作を続けられるようにする
    overlay().setPointerCapture(e.pointerId)
  } catch {
    // 取得できなくても操作は続ける
  }
  const p = toPx(e)
  pointers.set(e.pointerId, p)
  const tool = currentTool()

  if (pointers.size === 2) {
    // 2本目の指：範囲指定・切り取りは取り消し、文字は拡大縮小に切り替える
    if (gesture?.type === 'text-drag' && selectedText()) {
      history.breakMerge()
      gesture = { type: 'pinch', id: selectedId, dist0: pinchDistance(), size0: selectedText().size, gestureId: newId() }
    } else {
      gesture = null
    }
    renderOverlay()
    return
  }
  if (pointers.size > 2) return

  if (tool === 'crop') {
    const r = history.geometry.crop
    const css = overlay().getBoundingClientRect()
    const handle = hitHandle(r, p.x / view.width, p.y / view.height, css, lockedRatio() !== null)
    gesture = handle ? { type: 'crop', handle, start: p, startRect: r, rect: r } : null
    return
  }

  if (tool === 'text') {
    const hit = hitText(p)
    if (hit) {
      select(hit.id)
      history.breakMerge()
      const [cx, cy] = view.toPx(hit.x, hit.y)
      gesture = { type: 'text-drag', id: hit.id, start: p, cx, cy, gestureId: newId() }
    } else {
      select(null)
      gesture = null
    }
    render()
    return
  }

  gesture =
    radioValue('edit-shape') === 'rect'
      ? { type: 'rect', x0: p.x, y0: p.y, x1: p.x, y1: p.y }
      : { type: 'brush', points: [view.fromPx(p.x, p.y)] }
  renderOverlay()
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return
  e.preventDefault()
  const p = toPx(e)
  const prev = pointers.get(e.pointerId)
  pointers.set(e.pointerId, p)
  if (!gesture) return

  if (gesture.type === 'crop') {
    const css = overlay().getBoundingClientRect()
    const dx = (p.x - gesture.start.x) / view.width
    const dy = (p.y - gesture.start.y) / view.height
    gesture.rect = dragCrop(gesture.startRect, gesture.handle, dx, dy, lockedRatio(), css)
    renderOverlay()
  } else if (gesture.type === 'rect') {
    gesture.x1 = p.x
    gesture.y1 = p.y
    renderOverlay()
  } else if (gesture.type === 'brush') {
    const rect = overlay().getBoundingClientRect()
    // 2px 以上動いたときだけ点を増やす（点が多すぎると保存時の処理が重くなる）
    if (Math.hypot(((p.x - prev.x) / view.width) * rect.width, ((p.y - prev.y) / view.height) * rect.height) >= 2) {
      gesture.points.push(view.fromPx(p.x, p.y))
      renderOverlay()
    } else {
      pointers.set(e.pointerId, prev)
    }
  } else if (gesture.type === 'text-drag') {
    const x = Math.min(view.width, Math.max(0, gesture.cx + p.x - gesture.start.x))
    const y = Math.min(view.height, Math.max(0, gesture.cy + p.y - gesture.start.y))
    const [u, v] = view.fromPx(x, y)
    updateSelectedText({ x: u, y: v }, `drag${gesture.gestureId}`)
  } else if (gesture.type === 'pinch' && pointers.size === 2) {
    const size = Math.min(0.5 * frameRatio(), Math.max(0.01 * frameRatio(), (gesture.size0 * pinchDistance()) / gesture.dist0))
    updateSelectedText({ size }, `pinch${gesture.gestureId}`)
  }
}

function onPointerUp(e) {
  if (!pointers.has(e.pointerId)) return
  pointers.delete(e.pointerId)
  const g = gesture
  if (pointers.size > 0) {
    // ピンチの片方の指を離したら、残りの指では何もしない
    if (g?.type === 'pinch') gesture = null
    return
  }
  gesture = null
  history.breakMerge()
  if (e.type === 'pointercancel' || !g) {
    renderOverlay()
    return
  }

  const tool = currentTool()
  if (g.type === 'crop') {
    if (g.rect !== g.startRect) history.commitGeometry({ ...history.geometry, crop: g.rect })
  } else if (g.type === 'rect') {
    const r = pxRect(g)
    if (r.w >= MIN_RECT * view.width && r.h >= MIN_RECT * view.height) {
      history.add(areaOp(tool, { shape: 'rect', ...rectFromPx(view, r) }))
    } else {
      showToast('範囲が小さすぎます。斜めにドラッグして囲んでください')
    }
  } else if (g.type === 'brush') {
    history.add(areaOp(tool, { shape: 'brush', points: g.points, brush: brushSize() }))
  }
  render()
}

function areaOp(effect, shape) {
  return {
    id: newId(),
    kind: 'area',
    effect,
    strength: strength(),
    color: $('edit-fill-color').value,
    ...shape,
  }
}

// ---- 画像の読み込み ----

function releaseAll() {
  for (const c of [sourcePreview, base, areaCache]) releaseCanvas(c)
  sourcePreview = null
  base = null
  areaCache = null
  areaOpsInCache = []
  view = null
  viewKey = ''
}

async function loadFile(f) {
  $('editor-loading').hidden = false
  $('editor').hidden = false
  $('editor-stage').hidden = true
  try {
    const decoded = await decodeImage(f)
    try {
      const limited = clampToCanvasLimit(decoded.width, decoded.height)
      const s = Math.min(1, PREVIEW_MAX_EDGE / Math.max(limited.width, limited.height))
      const w = Math.max(1, Math.round(limited.width * s))
      const h = Math.max(1, Math.round(limited.height * s))
      releaseAll()
      sourcePreview = drawResized(decoded.source, decoded.width, decoded.height, w, h)
      srcW = decoded.width
      srcH = decoded.height
      previewScale = w / decoded.width
      file = f
      history.reset()
      selectedId = null
      cropRatio = 'free'
      $('edit-file-summary').textContent = `${f.name}（${decoded.width}×${decoded.height}）`
    } finally {
      decoded.close()
    }
    $('editor-stage').hidden = false
    render()
  } catch (err) {
    console.error(err)
    file = null
    releaseAll()
    $('editor').hidden = true
    $('edit-file-summary').textContent = err?.message || '画像を読み込めませんでした'
  } finally {
    $('editor-loading').hidden = true
  }
}

// ---- 公開 API ----

/**
 * 編集中の画像と編集内容。画像が選ばれていなければ null
 * @returns {{ file: File, edit: { geometry: object, ops: object[] }, edited: boolean } | null}
 */
export function getEditTarget() {
  if (!file) return null
  const { geometry, ops } = history.state
  return { file, edit: { geometry, ops }, edited: ops.length > 0 || !isIdentityGeometry(geometry) }
}

/** 画像と編集をすべて取り消して、画像を選ぶ前の状態に戻す */
export function clearEditor() {
  file = null
  history.reset()
  selectedId = null
  gesture = null
  pointers.clear()
  releaseAll()
  for (const c of [canvas(), overlay()]) releaseCanvas(c)
  $('editor').hidden = true
  $('edit-file-input').value = ''
  $('edit-file-summary').textContent = 'まだ選択されていません'
  updateControls()
}

/**
 * @param {{ onFileChange?: (file: File | null) => void }} [handlers]
 */
export function initEditor(handlers = {}) {
  const fontSelect = $('text-font')
  for (const f of FONTS) {
    const option = document.createElement('option')
    option.value = f.id
    option.textContent = f.label
    fontSelect.appendChild(option)
  }

  const ratios = $('crop-ratios')
  for (const r of CROP_RATIOS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.dataset.id = r.id
    btn.setAttribute('role', 'radio')
    const label = document.createElement('strong')
    label.textContent = r.label
    const note = document.createElement('span')
    note.textContent = r.note
    btn.append(label, note)
    btn.addEventListener('click', () => chooseRatio(r.id))
    ratios.appendChild(btn)
  }

  $('edit-file-input').addEventListener('change', async (e) => {
    const f = e.target.files?.[0]
    e.target.value = '' // 同じファイルを選び直せるように
    if (!f) return
    await loadFile(f)
    handlers.onFileChange?.(file)
  })

  const o = overlay()
  o.addEventListener('pointerdown', onPointerDown)
  o.addEventListener('pointermove', onPointerMove)
  o.addEventListener('pointerup', onPointerUp)
  o.addEventListener('pointercancel', onPointerUp)
  // iOS Safari のピンチズームを止める（touch-action: none に加えて念のため）
  for (const type of ['gesturestart', 'gesturechange']) {
    $('editor-stage').addEventListener(type, (e) => e.preventDefault())
  }

  $('edit-undo').addEventListener('click', () => {
    history.undo()
    if (!selectedText()) selectedId = null
    syncRatioWithCrop()
    render()
  })
  $('edit-redo').addEventListener('click', () => {
    history.redo()
    if (!selectedText()) selectedId = null
    syncRatioWithCrop()
    render()
  })
  $('edit-reset').addEventListener('click', () => {
    if (!confirm('回転・切り取りを含む、すべての編集を取り消しますか？（「戻す」で元に戻せます）')) return
    history.clearAll()
    selectedId = null
    cropRatio = 'free'
    render()
  })

  $('rotate-left').addEventListener('click', () => applyGeometry(rotateLeft(history.geometry), { transpose: true }))
  $('rotate-right').addEventListener('click', () => applyGeometry(rotateRight(history.geometry), { transpose: true }))
  $('flip-h').addEventListener('click', () => applyGeometry(flipHorizontal(history.geometry)))
  $('flip-v').addEventListener('click', () => applyGeometry(flipVertical(history.geometry)))
  $('crop-reset').addEventListener('click', () => {
    cropRatio = 'free'
    applyGeometry({ ...history.geometry, crop: FULL_CROP })
  })

  for (const name of ['edit-tool', 'edit-shape']) {
    for (const input of document.querySelectorAll(`input[name="${name}"]`)) {
      input.addEventListener('change', () => {
        if (currentTool() !== 'text') selectedId = null
        gesture = null
        render()
      })
    }
  }
  for (const id of ['edit-strength', 'edit-brush']) $(id).addEventListener('input', updateControls)

  $('text-add').addEventListener('click', () => {
    const { frameSize, ...style } = lastTextStyle
    const [x, y] = view.fromPx(view.width / 2, view.height / 2)
    const op = { id: newId(), kind: 'text', text: 'テキスト', x, y, size: frameSize * frameRatio(), ...style }
    history.add(op)
    select(op.id)
    render()
  })
  $('text-content').addEventListener('input', (e) => updateSelectedText({ text: e.target.value }, 'text'))
  $('text-font').addEventListener('change', (e) => updateSelectedText({ font: e.target.value }))
  $('text-size').addEventListener('input', (e) =>
    updateSelectedText({ size: (Number(e.target.value) / 100) * frameRatio() }, 'size'),
  )
  $('text-color').addEventListener('input', (e) => updateSelectedText({ color: e.target.value }, 'color'))
  $('text-stroke-color').addEventListener('input', (e) => updateSelectedText({ strokeColor: e.target.value }, 'stroke-color'))
  $('text-stroke-width').addEventListener('input', (e) =>
    updateSelectedText({ strokeWidth: Number(e.target.value) / 100 }, 'stroke-width'),
  )
  $('text-band').addEventListener('change', (e) => updateSelectedText({ band: e.target.checked }))
  // スライダーや入力欄の操作が終わったら、次の操作は別の Undo にする
  for (const id of ['text-content', 'text-size', 'text-color', 'text-stroke-color', 'text-stroke-width']) {
    $(id).addEventListener('change', () => history.breakMerge())
  }
  $('text-delete').addEventListener('click', () => {
    if (!selectedId) return
    history.remove(selectedId)
    selectedId = null
    render()
  })

  updateControls()
}

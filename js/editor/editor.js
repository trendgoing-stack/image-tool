/**
 * 1枚編集モードの画面：ぼかし・モザイク・塗りつぶし・文字入れ。
 *
 * 編集は縮小したプレビュー上で行い、加工は画像に対する割合の座標で記録する（ops.js / render.js）。
 * 保存時は pipeline.js が元の解像度の画像に同じ加工リストを適用する。
 *
 * 画面は 2枚の canvas を重ねている：
 *   edit-canvas  … 画像＋加工の結果
 *   edit-overlay … 操作中の枠やブラシの軌跡、選択中の文字の枠（保存結果には含まれない）
 */
import { decodeImage } from '../core/decode.js'
import { drawResized } from '../core/resize.js'
import { clampToCanvasLimit, createCanvas, releaseCanvas } from '../core/limits.js'
import { EditHistory, newId } from './ops.js'
import { applyAreaOp, drawTexts, traceBrush } from './render.js'
import { FONTS, textBounds } from './text.js'
import { showToast } from '../ui/toast.js'

const $ = (id) => document.getElementById(id)

/** プレビューの長辺の上限（px）。保存時は元の解像度で処理する */
const PREVIEW_MAX_EDGE = 2048
/** 四角の範囲として扱う最小の大きさ（画像に対する割合）。誤タップで小さな加工ができないように */
const MIN_RECT = 0.01

const history = new EditHistory()
let file = null
let base = null // 加工前のプレビュー画像
let areaCache = null // base に範囲の加工を適用したもの
let areaOpsInCache = [] // areaCache に適用済みの加工
let selectedId = null
let gesture = null
const pointers = new Map()
let lastTextStyle = {
  font: 'gothic-bold',
  size: 0.08,
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
  for (const op of areaOps.slice(areaOpsInCache.length)) applyAreaOp(areaCache, op)
  areaOpsInCache = areaOps
}

function renderMain() {
  if (!base) return
  syncAreaCache()
  const c = canvas()
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.drawImage(areaCache, 0, 0)
  drawTexts(c, history.ops)
}

function renderOverlay() {
  const o = overlay()
  const ctx = o.getContext('2d')
  ctx.clearRect(0, 0, o.width, o.height)
  const lineScale = o.width / o.getBoundingClientRect().width || 1
  ctx.lineWidth = 2 * lineScale
  ctx.setLineDash([6 * lineScale, 4 * lineScale])

  if (gesture?.type === 'rect') {
    const r = normRect(gesture)
    ctx.fillStyle = 'rgba(10, 132, 255, 0.2)'
    ctx.fillRect(r.x * o.width, r.y * o.height, r.w * o.width, r.h * o.height)
    ctx.strokeStyle = '#ffffff'
    ctx.strokeRect(r.x * o.width, r.y * o.height, r.w * o.width, r.h * o.height)
  } else if (gesture?.type === 'brush') {
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(10, 132, 255, 0.5)'
    ctx.fillStyle = 'rgba(10, 132, 255, 0.5)'
    traceBrush(ctx, { points: gesture.points, brush: brushSize() }, o.width, o.height)
  }

  const text = selectedText()
  if (text) {
    const b = textBounds(canvas().getContext('2d'), text, o.width, o.height)
    const pad = 6 * lineScale
    ctx.strokeStyle = '#0a84ff'
    ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2)
  }
}

function render() {
  renderMain()
  renderOverlay()
  updateControls()
}

// ---- 操作パネル ----

function strength() {
  return Number($('edit-strength').value)
}

function brushSize() {
  return Number($('edit-brush').value) / 100
}

function updateControls() {
  $('edit-undo').disabled = !history.canUndo
  $('edit-redo').disabled = !history.canRedo
  $('edit-reset').disabled = history.ops.length === 0

  const tool = currentTool()
  const shape = radioValue('edit-shape')
  const isText = tool === 'text'
  $('area-options').hidden = isText
  $('text-options').hidden = !isText
  $('strength-row').hidden = tool === 'fill'
  $('fill-color-row').hidden = tool !== 'fill'
  $('brush-row').hidden = shape !== 'brush'
  $('edit-strength-value').textContent = String(strength())
  $('edit-brush-value').textContent = `${$('edit-brush').value}%`
  $('area-hint').textContent =
    shape === 'rect' ? '画像の上を斜めにドラッグして、範囲を四角で囲みます' : '隠したい部分を指でなぞります'

  const text = isText ? selectedText() : null
  $('text-panel').hidden = !text
  $('text-none').hidden = Boolean(text)
  if (text) {
    // 入力中の欄を上書きしないように、値が違うときだけ反映する
    setValue('text-content', text.text)
    setValue('text-font', text.font)
    setValue('text-size', String(Math.round(text.size * 200) / 2))
    setValue('text-color', text.color)
    setValue('text-stroke-color', text.strokeColor)
    setValue('text-stroke-width', String(Math.round(text.strokeWidth * 100)))
    $('text-band').checked = text.band
    $('text-size-value').textContent = `${Math.round(text.size * 200) / 2}%`
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
    const { font, size, color, strokeColor, strokeWidth, band } = text
    lastTextStyle = { font, size, color, strokeColor, strokeWidth, band }
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

// ---- タッチ操作 ----

function toNorm(e) {
  const rect = overlay().getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
  }
}

function normRect(g) {
  return {
    x: Math.min(g.x0, g.x1),
    y: Math.min(g.y0, g.y1),
    w: Math.abs(g.x1 - g.x0),
    h: Math.abs(g.y1 - g.y0),
  }
}

function hitText(p) {
  const c = canvas()
  const ctx = c.getContext('2d')
  const texts = history.ops.filter((op) => op.kind === 'text')
  // 後から追加したもの（上に描かれているもの）を優先する
  for (let i = texts.length - 1; i >= 0; i--) {
    const b = textBounds(ctx, texts[i], c.width, c.height)
    const pad = c.width * 0.02
    const x = p.x * c.width
    const y = p.y * c.height
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return texts[i]
  }
  return null
}

function pinchDistance() {
  const [a, b] = [...pointers.values()]
  const rect = overlay().getBoundingClientRect()
  return Math.hypot((a.x - b.x) * rect.width, (a.y - b.y) * rect.height)
}

function onPointerDown(e) {
  if (!base) return
  e.preventDefault()
  try {
    // 指が画像の外に出ても操作を続けられるようにする
    overlay().setPointerCapture(e.pointerId)
  } catch {
    // 取得できなくても操作は続ける
  }
  const p = toNorm(e)
  pointers.set(e.pointerId, p)
  const tool = currentTool()

  if (pointers.size === 2) {
    // 2本目の指：範囲指定は取り消し、文字は拡大縮小に切り替える
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

  if (tool === 'text') {
    const hit = hitText(p)
    if (hit) {
      select(hit.id)
      history.breakMerge()
      gesture = { type: 'text-drag', id: hit.id, start: p, x0: hit.x, y0: hit.y, gestureId: newId() }
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
      : { type: 'brush', points: [[p.x, p.y]] }
  renderOverlay()
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return
  e.preventDefault()
  const p = toNorm(e)
  pointers.set(e.pointerId, p)
  if (!gesture) return

  if (gesture.type === 'rect') {
    gesture.x1 = p.x
    gesture.y1 = p.y
    renderOverlay()
  } else if (gesture.type === 'brush') {
    const last = gesture.points[gesture.points.length - 1]
    const rect = overlay().getBoundingClientRect()
    // 2px 以上動いたときだけ点を増やす（点が多すぎると保存時の処理が重くなる）
    if (Math.hypot((p.x - last[0]) * rect.width, (p.y - last[1]) * rect.height) >= 2) {
      gesture.points.push([p.x, p.y])
      renderOverlay()
    }
  } else if (gesture.type === 'text-drag') {
    const x = Math.min(1, Math.max(0, gesture.x0 + p.x - gesture.start.x))
    const y = Math.min(1, Math.max(0, gesture.y0 + p.y - gesture.start.y))
    updateSelectedText({ x, y }, `drag${gesture.gestureId}`)
  } else if (gesture.type === 'pinch' && pointers.size === 2) {
    const size = Math.min(0.5, Math.max(0.01, (gesture.size0 * pinchDistance()) / gesture.dist0))
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
  if (g.type === 'rect') {
    const r = normRect(g)
    if (r.w >= MIN_RECT && r.h >= MIN_RECT) {
      history.add(areaOp(tool, { shape: 'rect', ...r }))
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
      releaseCanvas(base)
      releaseCanvas(areaCache)
      base = drawResized(decoded.source, decoded.width, decoded.height, w, h)
      areaCache = createCanvas(w, h)
      for (const c of [canvas(), overlay()]) {
        c.width = w
        c.height = h
      }
      const stage = $('editor-stage')
      stage.style.aspectRatio = `${w} / ${h}`
      // 縦長の画像でも画面に収まるように、高さを画面の 6割程度までにする
      stage.style.maxWidth = `min(100%, calc(60vh * ${w / h}))`
      file = f
      history.reset()
      selectedId = null
      $('edit-file-summary').textContent = `${f.name}（${decoded.width}×${decoded.height}）`
    } finally {
      decoded.close()
    }
    areaOpsInCache = []
    const ctx = areaCache.getContext('2d')
    ctx.drawImage(base, 0, 0)
    $('editor-stage').hidden = false
    render()
  } catch (err) {
    console.error(err)
    file = null
    $('editor').hidden = true
    $('edit-file-summary').textContent = err?.message || '画像を読み込めませんでした'
  } finally {
    $('editor-loading').hidden = true
  }
}

// ---- 公開 API ----

/** 編集中の画像と加工リスト。画像が選ばれていなければ null */
export function getEditTarget() {
  return file ? { file, edits: history.ops } : null
}

/** 画像と加工をすべて取り消して、画像を選ぶ前の状態に戻す */
export function clearEditor() {
  file = null
  history.reset()
  selectedId = null
  gesture = null
  pointers.clear()
  releaseCanvas(base)
  releaseCanvas(areaCache)
  base = null
  areaCache = null
  areaOpsInCache = []
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
    render()
  })
  $('edit-redo').addEventListener('click', () => {
    history.redo()
    if (!selectedText()) selectedId = null
    render()
  })
  $('edit-reset').addEventListener('click', () => {
    if (!confirm('すべての加工を取り消しますか？（「戻す」で元に戻せます）')) return
    history.commit([])
    selectedId = null
    render()
  })

  for (const name of ['edit-tool', 'edit-shape']) {
    for (const input of document.querySelectorAll(`input[name="${name}"]`)) {
      input.addEventListener('change', () => {
        if (currentTool() !== 'text') selectedId = null
        render()
      })
    }
  }
  for (const id of ['edit-strength', 'edit-brush']) $(id).addEventListener('input', updateControls)

  $('text-add').addEventListener('click', () => {
    const op = { id: newId(), kind: 'text', text: 'テキスト', x: 0.5, y: 0.5, ...lastTextStyle }
    history.add(op)
    select(op.id)
    render()
  })
  $('text-content').addEventListener('input', (e) => updateSelectedText({ text: e.target.value }, 'text'))
  $('text-font').addEventListener('change', (e) => updateSelectedText({ font: e.target.value }))
  $('text-size').addEventListener('input', (e) => updateSelectedText({ size: Number(e.target.value) / 100 }, 'size'))
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

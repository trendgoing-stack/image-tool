import { defaultSettings } from './settings/model.js'
import { initSettingsForm, readSettings } from './ui/settingsForm.js'
import { processImage } from './core/pipeline.js'
import { saveResult } from './output/share.js'
import { showToast } from './ui/toast.js'

const $ = (id) => document.getElementById(id)

let selectedFile = null

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function renderResult(file, result) {
  const li = el('li', 'result')
  li.appendChild(el('div', 'result-name', result.name))
  const q = result.quality != null ? ` / 画質 ${result.quality}%` : ''
  li.appendChild(
    el('div', 'result-meta', `${result.srcWidth}×${result.srcHeight} → ${result.width}×${result.height}${q}`),
  )

  const before = file.size
  const after = result.blob.size
  const rate = Math.round((1 - after / before) * 100)
  const saving = el('div', 'result-saving', `${formatBytes(before)} → ${formatBytes(after)}（${rate >= 0 ? `${rate}% 削減` : `${-rate}% 増加`}）`)
  if (rate > 0) saving.classList.add('good')
  li.appendChild(saving)

  if (after > before) {
    li.appendChild(el('div', 'badge warn', '処理後のほうがファイルサイズが大きくなりました。画質を下げるか、JPEGで出力すると小さくなります'))
  }
  if (result.clamped) {
    li.appendChild(
      el('div', 'badge warn', `端末の処理上限（約1,677万画素）を超えるため、${result.width}×${result.height} に自動で縮小しました`),
    )
  }
  if (result.targetReached === false) {
    li.appendChild(el('div', 'badge warn', '最低画質でも目標サイズに届かなかったため、最も小さい結果を出力しました'))
  }

  const actions = el('div', 'result-actions')
  const save = el('button', 'button small', '保存')
  save.type = 'button'
  save.addEventListener('click', async () => {
    try {
      const outcome = await saveResult(result)
      if (outcome === 'downloaded') showToast('ダウンロードしました')
    } catch (err) {
      showToast(`保存できませんでした：${err.message}`, 5000)
    }
  })
  actions.appendChild(save)
  li.appendChild(actions)
  return li
}

function renderError(file, err) {
  const li = el('li', 'result')
  li.appendChild(el('div', 'result-name', file.name))
  li.appendChild(el('div', 'badge error', err?.message || '処理に失敗しました'))
  return li
}

async function runProcess() {
  if (!selectedFile) return
  const button = $('process-button')
  const results = $('results')
  button.disabled = true
  results.replaceChildren()
  $('progress').textContent = '処理中…'
  try {
    const settings = readSettings()
    const result = await processImage(selectedFile, settings)
    results.appendChild(renderResult(selectedFile, result))
    if (result.clamped) showToast('大きすぎる画像を自動で縮小しました')
    $('progress').textContent = '完了しました。「保存」を押すと共有シートが開きます'
  } catch (err) {
    console.error(err)
    results.appendChild(renderError(selectedFile, err))
    $('progress').textContent = ''
  } finally {
    button.disabled = false
  }
}

function init() {
  initSettingsForm(defaultSettings())

  $('file-input').addEventListener('change', (e) => {
    selectedFile = e.target.files?.[0] ?? null
    $('file-summary').textContent = selectedFile ? `${selectedFile.name}（${formatBytes(selectedFile.size)}）` : 'まだ選択されていません'
    $('process-button').disabled = !selectedFile
    $('results').replaceChildren()
    $('progress').textContent = ''
  })
  $('process-button').addEventListener('click', runProcess)
}

init()

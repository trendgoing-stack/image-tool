import { defaultSettings } from './settings/model.js'
import { initSettingsForm, readSettings } from './ui/settingsForm.js'
import { processBatch } from './core/batch.js'
import { canShareFiles, downloadBlob, saveResult, shareFiles, toFile } from './output/share.js'
import { uniqueNames } from './output/naming.js'
import { createZip, zipFileName } from './output/zip.js'
import { clearResults, formatBytes, renderError, renderResult, savingText } from './ui/resultList.js'
import { initCompare, openCompare } from './ui/compare.js'
import { showToast } from './ui/toast.js'
import { initPresetsPanel } from './ui/presetsPanel.js'
import { loadLastSettings, saveLastSettings } from './settings/presets.js'
import { registerServiceWorker } from './sw-register.js'
import { APP_VERSION } from './version.js'
import { clearEditor, getEditTarget, initEditor } from './editor/editor.js'

const $ = (id) => document.getElementById(id)

let selectedFiles = []
/** 成功した処理結果 { file, result } の一覧 */
let processed = []
/** 共有が「ユーザー操作の直後ではない」と拒否されたときのために作っておいた ZIP */
let preparedZip = null
let running = null
/** 'batch'（まとめて処理）| 'edit'（1枚を編集） */
let mode = 'batch'

function hasInput() {
  return mode === 'edit' ? Boolean(getEditTarget()) : selectedFiles.length > 0
}

function resetOutput() {
  clearResults($('results'))
  processed = []
  preparedZip = null
  $('bulk').hidden = true
  $('progress').textContent = ''
  $('progress-wrap').hidden = true
  $('zip-button').textContent = 'ZIPで保存'
}

function setRunning(isRunning) {
  $('process-button').disabled = isRunning || !hasInput()
  $('process-button').textContent = isRunning ? '処理中…' : mode === 'edit' ? '編集した画像を処理する' : '処理する'
  $('cancel-button').hidden = !isRunning || mode === 'edit'
  $('file-input').disabled = isRunning
  $('edit-file-input').disabled = isRunning
  for (const input of document.querySelectorAll('input[name="app-mode"]')) input.disabled = isRunning
  $('batch-clear').hidden = selectedFiles.length === 0
  $('edit-clear').hidden = !getEditTarget()
  $('batch-clear').disabled = isRunning
  $('edit-clear').disabled = isRunning
}

async function saveOne(result) {
  try {
    const outcome = await saveResult(result)
    if (outcome === 'downloaded') showToast('ダウンロードしました')
  } catch (err) {
    showToast(`保存できませんでした：${err.message}`, 5000)
  }
}

function namedEntries() {
  const names = uniqueNames(processed.map((p) => p.result.name))
  return processed.map((p, i) => ({ name: names[i], blob: p.result.blob, result: p.result }))
}

function updateBulk() {
  if (processed.length < 2) {
    $('bulk').hidden = true
    return
  }
  const before = processed.reduce((sum, p) => sum + p.file.size, 0)
  const after = processed.reduce((sum, p) => sum + p.result.blob.size, 0)
  $('bulk-summary').textContent = `${processed.length}枚：${savingText(before, after)}`
  const files = namedEntries().map((e) => toFile(e.result, e.name))
  $('share-all-button').hidden = !canShareFiles(files)
  $('bulk').hidden = false
}

async function shareAll() {
  const files = namedEntries().map((e) => toFile(e.result, e.name))
  try {
    await shareFiles(files)
  } catch (err) {
    console.error(err)
    showToast('まとめて共有できませんでした。枚数を減らすか、ZIPで保存してください', 5000)
  }
}

async function saveZip() {
  const button = $('zip-button')
  try {
    if (!preparedZip) {
      button.disabled = true
      button.textContent = 'ZIPを作成中…'
      const blob = await createZip(namedEntries())
      preparedZip = new File([blob], zipFileName(), { type: 'application/zip' })
    }
    const zip = preparedZip
    if (canShareFiles([zip])) {
      try {
        await shareFiles([zip])
      } catch (err) {
        // ZIP の作成に時間がかかると、共有が「タップ直後ではない」として拒否されることがある
        if (err?.name === 'NotAllowedError') {
          button.textContent = 'ZIPの準備ができました（タップで保存）'
          return
        }
        throw err
      }
    } else {
      downloadBlob(zip, zip.name)
      showToast('ZIPをダウンロードしました')
    }
    button.textContent = 'ZIPで保存'
  } catch (err) {
    console.error(err)
    showToast(`ZIPを保存できませんでした：${err.message}`, 5000)
    button.textContent = 'ZIPで保存'
  } finally {
    button.disabled = false
  }
}

async function runProcess() {
  if (!hasInput() || running) return
  resetOutput()
  const target = mode === 'edit' ? getEditTarget() : null
  const files = target ? [target.file] : selectedFiles.slice()
  // 編集モードでは、その時点の加工リストを使う（処理中に編集しても影響しない）
  const options = target ? { edit: target.edit } : {}
  const settings = readSettings()
  const signal = { cancelled: false }
  running = signal
  setRunning(true)
  $('progress-wrap').hidden = false
  let clampedCount = 0

  const summary = await processBatch(files, settings, {
    signal,
    onProgress(index, total) {
      $('progress-bar').value = index / total
      $('progress').textContent = index < total ? `処理中… ${index + 1} / ${total} 枚` : ''
    },
    onResult(file, result) {
      processed.push({ file, result })
      if (result.clamped) clampedCount++
      $('results').appendChild(
        renderResult(file, result, {
          onSave: () => saveOne(result),
          onCompare: () => openCompare(file, result),
        }),
      )
    },
    onError(file, err) {
      $('results').appendChild(renderError(file, err))
    },
  }, options)

  running = null
  setRunning(false)
  $('progress-wrap').hidden = true
  const parts = [`${summary.done}枚 完了`]
  if (summary.failed) parts.push(`${summary.failed}枚 失敗`)
  if (summary.cancelled) parts.push('中止しました')
  $('progress').textContent = `${parts.join('・')}。保存ボタンで共有シートが開きます`
  if (clampedCount) showToast(`${clampedCount}枚を処理上限に合わせて自動で縮小しました`, 4000)
  updateBulk()
}

function initHelp() {
  const dialog = $('help')
  $('help-button').addEventListener('click', () => {
    dialog.showModal()
    dialog.querySelector('.help-body').scrollTop = 0
  })
  $('help-close').addEventListener('click', () => dialog.close())
}

function updateFileSummary() {
  const total = selectedFiles.reduce((sum, f) => sum + f.size, 0)
  $('file-summary').textContent =
    selectedFiles.length === 0
      ? 'まだ選択されていません'
      : selectedFiles.length === 1
        ? `${selectedFiles[0].name}（${formatBytes(total)}）`
        : `${selectedFiles.length}枚（合計 ${formatBytes(total)}）`
}

/** 選んだ画像・加工・処理結果をクリアして、画像を選ぶ前の状態に戻す（設定とプリセットは残す） */
function clearSelection() {
  if (running) return
  const edited = mode === 'edit' && Boolean(getEditTarget()?.edited)
  if ((processed.length > 0 || edited) && !confirm('選んだ画像と、編集内容・処理結果をクリアしますか？\n（元の写真は削除されません。保存していない処理結果は消えます）')) {
    return
  }
  if (mode === 'edit') {
    clearEditor()
  } else {
    selectedFiles = []
    $('file-input').value = ''
    updateFileSummary()
  }
  resetOutput()
  setRunning(false)
  $(mode === 'edit' ? 'editor-section' : 'batch-section').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function setMode(next) {
  mode = next
  $('batch-section').hidden = mode !== 'batch'
  $('editor-section').hidden = mode !== 'edit'
  resetOutput()
  setRunning(false)
}

function init() {
  $('app-version').textContent = `バージョン ${APP_VERSION}`
  initEditor({
    onFileChange() {
      resetOutput()
      setRunning(false)
    },
  })
  for (const input of document.querySelectorAll('input[name="app-mode"]')) {
    input.addEventListener('change', () => setMode(input.value))
  }
  // 前回の設定を復元し、変更のたびに保存する
  initSettingsForm(loadLastSettings() ?? defaultSettings(), saveLastSettings)
  initPresetsPanel()
  initCompare()
  initHelp()
  registerServiceWorker()

  $('file-input').addEventListener('change', (e) => {
    selectedFiles = Array.from(e.target.files ?? [])
    updateFileSummary()
    setRunning(false)
    resetOutput()
  })
  $('process-button').addEventListener('click', runProcess)
  $('batch-clear').addEventListener('click', clearSelection)
  $('edit-clear').addEventListener('click', clearSelection)
  $('cancel-button').addEventListener('click', () => {
    if (running) running.cancelled = true
    $('progress').textContent = '中止しています…（処理中の1枚が終わると止まります）'
  })
  $('share-all-button').addEventListener('click', shareAll)
  $('zip-button').addEventListener('click', saveZip)
}

init()

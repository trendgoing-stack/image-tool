import { defaultSettings } from './settings/model.js'
import { initSettingsForm, readSettings } from './ui/settingsForm.js'
import { processImage } from './core/pipeline.js'
import { saveResult } from './output/share.js'
import { clearResults, renderError, renderResult } from './ui/resultList.js'
import { initCompare, openCompare } from './ui/compare.js'
import { showToast } from './ui/toast.js'
import { initPresetsPanel } from './ui/presetsPanel.js'
import { loadLastSettings, saveLastSettings } from './settings/presets.js'
import { registerServiceWorker } from './sw-register.js'
import { APP_VERSION } from './version.js'
import { clearEditor, getEditTarget, initEditor } from './editor/editor.js'

const $ = (id) => document.getElementById(id)

/** 処理結果（保存していないかもしれないもの） */
let processed = null
let running = false

function resetOutput() {
  clearResults($('results'))
  processed = null
  $('progress').textContent = ''
}

function updateButtons() {
  $('process-button').disabled = running || !getEditTarget()
  $('process-button').textContent = running ? '処理中…' : '編集した画像を処理する'
  $('edit-file-input').disabled = running
  $('edit-clear').hidden = !getEditTarget()
  $('edit-clear').disabled = running
}

async function saveOne(result) {
  try {
    const outcome = await saveResult(result)
    if (outcome === 'downloaded') showToast('ダウンロードしました')
  } catch (err) {
    showToast(`保存できませんでした：${err.message}`, 5000)
  }
}

/** UI の更新を反映させてから重い処理に入るため、いったん制御を返す */
function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 30))
}

async function runProcess() {
  const target = getEditTarget()
  if (!target || running) return
  resetOutput()
  // その時点の編集内容を使う（処理中に編集しても影響しない）
  const { file, edit } = target
  const settings = readSettings()
  running = true
  updateButtons()
  $('progress').textContent = '処理中…'
  await yieldToBrowser()

  try {
    const result = await processImage(file, settings, { thumbnails: true, edit })
    processed = result
    $('results').appendChild(
      renderResult(file, result, {
        onSave: () => saveOne(result),
        onCompare: () => openCompare(file, result),
      }),
    )
    $('progress').textContent = '完了しました。「保存」を押すと共有シートが開きます'
    if (result.clamped) showToast('処理上限に合わせて自動で縮小しました', 4000)
  } catch (err) {
    console.error(err)
    $('results').appendChild(renderError(file, err))
    $('progress').textContent = ''
  } finally {
    running = false
    updateButtons()
  }
}

function initHelp() {
  const dialog = $('help')
  $('help-button').addEventListener('click', () => {
    dialog.showModal()
    dialog.querySelector('.help-body').scrollTop = 0
  })
  $('help-close').addEventListener('click', () => dialog.close())
}

/** 選んだ画像・編集・処理結果をクリアして、画像を選ぶ前の状態に戻す（設定とプリセットは残す） */
function clearSelection() {
  if (running) return
  if (
    (processed || getEditTarget()?.edited) &&
    !confirm('選んだ画像と、編集内容・処理結果をクリアしますか？\n（元の写真は削除されません。保存していない処理結果は消えます）')
  ) {
    return
  }
  clearEditor()
  resetOutput()
  updateButtons()
  $('editor-section').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function init() {
  $('app-version').textContent = `バージョン ${APP_VERSION}`
  initEditor({
    onFileChange() {
      resetOutput()
      updateButtons()
    },
  })
  // 前回の設定を復元し、変更のたびに保存する
  initSettingsForm(loadLastSettings() ?? defaultSettings(), saveLastSettings)
  initPresetsPanel()
  initCompare()
  initHelp()
  registerServiceWorker()

  $('process-button').addEventListener('click', runProcess)
  $('edit-clear').addEventListener('click', clearSelection)
  updateButtons()
}

init()

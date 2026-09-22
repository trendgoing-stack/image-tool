/**
 * プリセットの一覧・呼び出し・保存・削除の画面。
 */
import { deletePreset, loadPresets, savePreset } from '../settings/presets.js'
import { readSettings, writeSettings } from './settingsForm.js'
import { showToast } from './toast.js'

const $ = (id) => document.getElementById(id)

function render() {
  const list = $('preset-list')
  const presets = loadPresets()
  list.replaceChildren()
  $('preset-empty').hidden = presets.length > 0
  for (const preset of presets) {
    const item = document.createElement('span')
    item.className = 'preset-chip'

    const apply = document.createElement('button')
    apply.type = 'button'
    apply.className = 'preset-apply'
    apply.textContent = preset.name
    apply.addEventListener('click', () => {
      writeSettings(preset.settings)
      showToast(`「${preset.name}」を呼び出しました`)
    })

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'preset-delete'
    remove.setAttribute('aria-label', `「${preset.name}」を削除`)
    remove.textContent = '×'
    remove.addEventListener('click', () => {
      if (!confirm(`プリセット「${preset.name}」を削除しますか？`)) return
      deletePreset(preset.name)
      render()
    })

    item.append(apply, remove)
    list.appendChild(item)
  }
}

export function initPresetsPanel() {
  $('preset-form').addEventListener('submit', (e) => {
    e.preventDefault()
    const input = $('preset-name')
    const name = input.value
    const exists = loadPresets().some((p) => p.name === name.trim())
    if (exists && !confirm(`「${name.trim()}」はすでにあります。今の設定で上書きしますか？`)) return
    const result = savePreset(name, readSettings())
    if (!result.ok) {
      showToast(result.reason, 4000)
      return
    }
    input.value = ''
    input.blur()
    showToast(result.replaced ? `「${name.trim()}」を上書きしました` : `「${name.trim()}」を保存しました`)
    render()
  })
  render()
}

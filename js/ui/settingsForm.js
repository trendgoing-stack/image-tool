/**
 * 設定画面：フォームと設定オブジェクトの相互変換、表示の切り替え。
 */
import { LONG_EDGE_PRESETS, normalizeSettings } from '../settings/model.js'

const $ = (id) => document.getElementById(id)

function radio(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value
}

function setRadio(name, value) {
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`)
  if (el) el.checked = true
}

/** フォームの内容を設定オブジェクトにする */
export function readSettings() {
  return normalizeSettings({
    resize: {
      mode: radio('resize-mode'),
      width: $('px-width').value,
      height: $('px-height').value,
      keepAspect: $('keep-aspect').checked,
      percent: $('percent').value,
      longEdge: $('long-edge').value,
      noEnlarge: $('no-enlarge').checked,
    },
    format: radio('format'),
    quality: $('quality').value,
    background: radio('background'),
    backgroundCustom: $('background-custom').value,
  })
}

/** 設定オブジェクトをフォームに反映する */
export function writeSettings(settings) {
  const s = normalizeSettings(settings)
  setRadio('resize-mode', s.resize.mode)
  $('px-width').value = s.resize.width
  $('px-height').value = s.resize.height
  $('keep-aspect').checked = s.resize.keepAspect
  $('percent').value = s.resize.percent
  $('long-edge').value = s.resize.longEdge
  $('no-enlarge').checked = s.resize.noEnlarge
  setRadio('format', s.format)
  $('quality').value = s.quality
  setRadio('background', s.background)
  $('background-custom').value = s.backgroundCustom
  refresh()
}

/** 選択に応じて表示・無効化を切り替える */
function refresh() {
  const s = readSettings()

  for (const panel of document.querySelectorAll('.mode-panel')) {
    panel.hidden = panel.dataset.mode !== s.resize.mode
  }
  $('no-enlarge-row').hidden = s.resize.mode === 'none'

  for (const btn of $('long-edge-presets').querySelectorAll('button')) {
    btn.classList.toggle('active', Number(btn.dataset.value) === s.resize.longEdge)
  }

  $('quality-value').textContent = `${s.quality}%`

  // PNG 出力のときは JPEG 用の設定を無効化し、理由を表示する
  const isPng = s.format === 'png'
  for (const id of ['jpeg-options', 'background-options']) {
    const fs = $(id)
    fs.classList.toggle('disabled', isPng)
    for (const input of fs.querySelectorAll('input')) input.disabled = isPng
    fs.querySelector('.png-reason').hidden = !isPng
  }
  $('custom-color-row').hidden = s.background !== 'custom'
}

export function initSettingsForm(initial) {
  const presets = $('long-edge-presets')
  for (const value of LONG_EDGE_PRESETS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.dataset.value = String(value)
    btn.textContent = `${value}px`
    btn.addEventListener('click', () => {
      $('long-edge').value = value
      refresh()
    })
    presets.appendChild(btn)
  }
  $('settings').addEventListener('input', refresh)
  $('settings').addEventListener('change', refresh)
  writeSettings(initial)
}

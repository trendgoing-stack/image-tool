/**
 * 設定プリセット（名前付き）と、前回の設定の保存（localStorage）。
 * Safari で開いた場合とホーム画面から起動した場合では localStorage が別になる。
 */
import { normalizeSettings } from './model.js'

const PRESETS_KEY = 'image-tool:presets'
const LAST_KEY = 'image-tool:last-settings'
export const MAX_PRESETS = 20

function read(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // プライベートブラウズや容量不足では保存できない
    return false
  }
}

/** @returns {{ name: string, settings: object }[]} */
export function loadPresets() {
  const list = read(PRESETS_KEY)
  if (!Array.isArray(list)) return []
  return list
    .filter((p) => p && typeof p.name === 'string' && p.name.trim())
    .map((p) => ({ name: p.name.trim(), settings: normalizeSettings(p.settings) }))
}

/**
 * 同じ名前があれば上書きする。
 * @returns {{ ok: boolean, replaced: boolean, reason?: string }}
 */
export function savePreset(name, settings) {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, replaced: false, reason: '名前を入力してください' }
  const list = loadPresets()
  const index = list.findIndex((p) => p.name === trimmed)
  const replaced = index >= 0
  if (replaced) list[index] = { name: trimmed, settings }
  else {
    if (list.length >= MAX_PRESETS) return { ok: false, replaced, reason: `プリセットは${MAX_PRESETS}件までです` }
    list.push({ name: trimmed, settings })
  }
  if (!write(PRESETS_KEY, list)) return { ok: false, replaced, reason: 'この端末では保存できませんでした' }
  return { ok: true, replaced }
}

export function deletePreset(name) {
  write(
    PRESETS_KEY,
    loadPresets().filter((p) => p.name !== name),
  )
}

export function loadLastSettings() {
  const s = read(LAST_KEY)
  return s ? normalizeSettings(s) : null
}

export function saveLastSettings(settings) {
  write(LAST_KEY, settings)
}

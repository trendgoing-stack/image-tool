/**
 * 処理設定の形と既定値。
 */

export const LONG_EDGE_PRESETS = [1080, 1280, 1920, 2560]

export const BACKGROUND_COLORS = { white: '#ffffff', black: '#000000' }

export function defaultSettings() {
  return {
    resize: {
      mode: 'none', // 'none' | 'pixels' | 'percent' | 'longEdge'
      width: '',
      height: '',
      keepAspect: true,
      percent: 50,
      longEdge: 1920,
      noEnlarge: true,
    },
    format: 'original', // 'original' | 'jpeg' | 'png'
    quality: 80, // JPEG 画質（%）
    targetSizeEnabled: false,
    targetSizeKB: 500,
    background: 'white', // 'white' | 'black' | 'custom'
    backgroundCustom: '#ff8800',
  }
}

/** 保存データなどを既定値とマージして、欠けや不正値を補う */
export function normalizeSettings(input) {
  const d = defaultSettings()
  const s = input && typeof input === 'object' ? input : {}
  const r = s.resize && typeof s.resize === 'object' ? s.resize : {}
  return {
    resize: {
      mode: ['none', 'pixels', 'percent', 'longEdge'].includes(r.mode) ? r.mode : d.resize.mode,
      width: r.width ?? d.resize.width,
      height: r.height ?? d.resize.height,
      keepAspect: typeof r.keepAspect === 'boolean' ? r.keepAspect : d.resize.keepAspect,
      percent: clampNum(r.percent, 1, 1000, d.resize.percent),
      longEdge: clampNum(r.longEdge, 1, 20000, d.resize.longEdge),
      noEnlarge: typeof r.noEnlarge === 'boolean' ? r.noEnlarge : d.resize.noEnlarge,
    },
    format: ['original', 'jpeg', 'png'].includes(s.format) ? s.format : d.format,
    quality: clampNum(s.quality, 10, 100, d.quality),
    targetSizeEnabled: typeof s.targetSizeEnabled === 'boolean' ? s.targetSizeEnabled : d.targetSizeEnabled,
    targetSizeKB: clampNum(s.targetSizeKB, 1, 100000, d.targetSizeKB),
    background: ['white', 'black', 'custom'].includes(s.background) ? s.background : d.background,
    backgroundCustom: /^#[0-9a-f]{6}$/i.test(s.backgroundCustom) ? s.backgroundCustom : d.backgroundCustom,
  }
}

export function backgroundColorOf(settings) {
  return settings.background === 'custom' ? settings.backgroundCustom : BACKGROUND_COLORS[settings.background]
}

function clampNum(v, min, max, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * 出力ファイル名：`元のファイル名_長辺px.拡張子`（リサイズなしなら `_compressed`）
 */

export function baseNameOf(fileName) {
  const name = fileName.replace(/^.*[\\/]/, '')
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name || 'image'
}

export function outputFileName(originalName, { width, height, resized, ext }) {
  const suffix = resized ? `${Math.max(width, height)}px` : 'compressed'
  return `${baseNameOf(originalName)}_${suffix}.${ext}`
}

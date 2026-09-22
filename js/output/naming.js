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

/** 同じ名前が重複したときに (2), (3) … を付ける（ZIP やまとめて共有で衝突しないように） */
export function uniqueNames(names) {
  const used = new Map()
  return names.map((name) => {
    const count = used.get(name) ?? 0
    used.set(name, count + 1)
    if (count === 0) return name
    const dot = name.lastIndexOf('.')
    return `${name.slice(0, dot)}(${count + 1})${name.slice(dot)}`
  })
}

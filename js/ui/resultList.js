/**
 * 処理結果の一覧（サムネイル、前後のサイズ、警告、保存ボタン）。
 */

const thumbUrls = []

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** 削減率（%）。増えた場合は負の値 */
export function savingRate(before, after) {
  return Math.round((1 - after / before) * 100)
}

export function savingText(before, after) {
  const rate = savingRate(before, after)
  return `${formatBytes(before)} → ${formatBytes(after)}（${rate >= 0 ? `${rate}% 削減` : `${-rate}% 増加`}）`
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function thumb(blob, caption) {
  const wrap = el('span')
  const img = el('img')
  img.alt = caption
  if (blob) {
    const url = URL.createObjectURL(blob)
    thumbUrls.push(url)
    img.src = url
  }
  wrap.append(img, el('span', 'thumb-caption', caption))
  return wrap
}

/** 一覧を空にして、サムネイルの ObjectURL を解放する */
export function clearResults(list) {
  list.replaceChildren()
  for (const url of thumbUrls.splice(0)) URL.revokeObjectURL(url)
}

/**
 * @param {File} file
 * @param {object} result processImage の結果
 * @param {{ onSave: () => void, onCompare: () => void }} actions
 */
export function renderResult(file, result, actions) {
  const li = el('li', 'result')

  const thumbs = el('button', 'result-thumbs')
  thumbs.type = 'button'
  thumbs.setAttribute('aria-label', `${result.name} を拡大して比較`)
  thumbs.append(thumb(result.thumbBefore, '前'), thumb(result.thumbAfter, '後'))
  thumbs.addEventListener('click', actions.onCompare)
  li.appendChild(thumbs)

  const body = el('div', 'result-body')
  body.appendChild(el('div', 'result-name', result.name))
  const q = result.quality != null ? ` / 画質 ${result.quality}%` : ''
  body.appendChild(el('div', 'result-meta', `${result.srcWidth}×${result.srcHeight} → ${result.width}×${result.height}${q}`))

  const saving = el('div', 'result-saving', savingText(file.size, result.blob.size))
  if (savingRate(file.size, result.blob.size) > 0) saving.classList.add('good')
  body.appendChild(saving)

  if (result.blob.size > file.size) {
    body.appendChild(el('div', 'badge warn', '処理後のほうがファイルサイズが大きくなりました。画質を下げるか、JPEGで出力すると小さくなります'))
  }
  if (result.clamped) {
    body.appendChild(el('div', 'badge warn', `端末の処理上限（約1,677万画素）を超えるため、${result.width}×${result.height} に自動で縮小しました`))
  }
  if (result.targetReached === false) {
    body.appendChild(el('div', 'badge warn', '最低画質（10%）でも目標サイズに届かなかったため、最も小さい結果を出力しました'))
  }

  const buttons = el('div', 'result-actions')
  const save = el('button', 'button small', '保存')
  save.type = 'button'
  save.addEventListener('click', actions.onSave)
  buttons.appendChild(save)
  body.appendChild(buttons)

  li.appendChild(body)
  return li
}

export function renderError(file, err) {
  const li = el('li', 'result error')
  li.appendChild(el('div', 'result-name', file.name))
  li.appendChild(el('div', 'badge error', err?.message || '処理に失敗しました'))
  return li
}

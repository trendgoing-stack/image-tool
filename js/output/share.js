/**
 * 保存（出力）：Web Share API で共有シートを開く。使えなければダウンロードにする。
 * 共有はユーザー操作（タップ）の直後でないと失敗するため、必ずボタンのクリック処理から直接呼ぶこと。
 */

export function toFile(result, name = result.name) {
  return new File([result.blob], name, { type: result.type, lastModified: Date.now() })
}

/** files を共有シートに渡せるか */
export function canShareFiles(files) {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files })
  } catch {
    return false
  }
}

/**
 * @returns {Promise<'shared' | 'cancelled'>}
 */
export async function shareFiles(files) {
  try {
    await navigator.share({ files })
    return 'shared'
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled'
    throw err
  }
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // すぐに revoke するとダウンロードが始まらないブラウザがあるため少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * 1枚を保存する。共有できれば共有シート、できなければダウンロード。
 * @returns {Promise<'shared' | 'cancelled' | 'downloaded'>}
 */
export async function saveResult(result) {
  const file = toFile(result)
  if (canShareFiles([file])) return shareFiles([file])
  downloadBlob(result.blob, result.name)
  return 'downloaded'
}

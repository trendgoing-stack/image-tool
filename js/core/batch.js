/**
 * 一括処理：必ず 1枚ずつ逐次処理する（iOS で同時に処理するとメモリ不足で落ちるため）。
 * 1枚ごとに制御を返して、進捗表示などの画面更新を挟む。
 */
import { processImage } from './pipeline.js'

/** 画面の更新とガベージコレクションの機会を作るため、いったん制御を返す */
function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 30))
}

/**
 * @param {File[]} files
 * @param {object} settings
 * @param {{
 *   onProgress?: (index: number, total: number) => void,
 *   onResult?: (file: File, result: object, index: number) => void,
 *   onError?: (file: File, error: Error, index: number) => void,
 *   signal?: { cancelled: boolean },
 * }} handlers
 * @param {{ edits?: object[] }} [options] processImage に渡す（編集モードの加工リスト）
 * @returns {Promise<{ done: number, failed: number, cancelled: boolean }>}
 */
export async function processBatch(files, settings, handlers = {}, options = {}) {
  let done = 0
  let failed = 0
  for (let i = 0; i < files.length; i++) {
    if (handlers.signal?.cancelled) return { done, failed, cancelled: true }
    handlers.onProgress?.(i, files.length)
    await yieldToBrowser()
    try {
      const result = await processImage(files[i], settings, { ...options, thumbnails: true })
      done++
      handlers.onResult?.(files[i], result, i)
    } catch (err) {
      failed++
      console.error(files[i].name, err)
      handlers.onError?.(files[i], err, i)
    }
  }
  handlers.onProgress?.(files.length, files.length)
  return { done, failed, cancelled: false }
}

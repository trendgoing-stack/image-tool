/**
 * 画面下に短いメッセージを出す。
 */
let timer = 0

export function showToast(message, ms = 3000) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = message
  el.hidden = false
  clearTimeout(timer)
  timer = setTimeout(() => {
    el.hidden = true
  }, ms)
}

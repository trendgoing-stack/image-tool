/**
 * Service Worker の登録と、新しいバージョンの検出。
 * 新しい SW の準備ができたら「更新があります」を表示し、タップで切り替えて再読み込みする。
 */

function showUpdateBanner(worker) {
  const banner = document.getElementById('update-banner')
  if (!banner) return
  banner.hidden = false
  banner.onclick = () => {
    banner.disabled = true
    worker.postMessage({ type: 'SKIP_WAITING' })
  }
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  // localhost 以外の http では SW が使えない（iPhone 実機は GitHub Pages の https で確認する）
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' })

      // すでに待機中の新バージョンがある（前回開いたときに取得済み）
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting)

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        worker?.addEventListener('statechange', () => {
          // controller がある＝初回インストールではなく更新
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(worker)
        })
      })

      // ホーム画面から起動したアプリは開きっぱなしになりやすいため、表示のたびに更新を確認する
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    } catch (err) {
      console.warn('Service Worker を登録できませんでした', err)
    }
  })
}

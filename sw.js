/**
 * Service Worker：キャッシュファーストで完全オフライン動作させる。
 *
 * 更新の流れ：
 *  1. ファイルを変更したら VERSION を上げる（node scripts/bump-version.mjs <版>）
 *  2. ブラウザが sw.js の変化を検出すると、新しい SW がファイルを取り直してキャッシュする
 *     （HTTP キャッシュを使わず必ずサーバーから取る。古いファイルと新しいファイルが混ざらないように）
 *  3. 画面に「更新があります」を出し、タップされたら新しい SW に切り替えて再読み込みする
 *  4. 切り替わった SW が古いバージョンのキャッシュを削除する
 */
const VERSION = '0.3.0'
const CACHE_PREFIX = 'image-tool-'
const CACHE_NAME = `${CACHE_PREFIX}v${VERSION}`

// scripts/bump-version.mjs が、ここに漏れがないか確認する
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/main.js',
  './js/version.js',
  './js/sw-register.js',
  './js/core/batch.js',
  './js/core/decode.js',
  './js/core/encode.js',
  './js/core/limits.js',
  './js/core/pipeline.js',
  './js/core/resize.js',
  './js/output/naming.js',
  './js/output/share.js',
  './js/output/zip.js',
  './js/settings/model.js',
  './js/settings/presets.js',
  './js/ui/compare.js',
  './js/ui/presetsPanel.js',
  './js/ui/resultList.js',
  './js/ui/settingsForm.js',
  './js/ui/toast.js',
  './vendor/fflate/fflate.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))),
    ),
  )
  // すぐには切り替えない（画面側で「更新があります」をタップしてもらう）
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      // ページの表示は常にキャッシュ済みの index.html を返す
      const cached =
        request.mode === 'navigate'
          ? await cache.match('./index.html')
          : await cache.match(request, { ignoreSearch: true })
      if (cached) return cached
      return fetch(request)
    })(),
  )
})

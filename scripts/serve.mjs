/**
 * PC で動作確認するための静的サーバー（外部ライブラリなし）。
 *   node scripts/serve.mjs [port]
 * GitHub Pages と同じくサブパスで配信する： http://localhost:8080/image-tool/
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '/image-tool/'
const PORT = Number(process.argv[2] || process.env.PORT || 8080)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.md': 'text/plain; charset=utf-8',
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/' || url.pathname === '/image-tool') {
    res.writeHead(302, { Location: BASE })
    return res.end()
  }
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404)
    return res.end('Not found')
  }
  let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html'
  const file = normalize(join(ROOT, rel))
  if (!file.startsWith(ROOT)) {
    res.writeHead(403)
    return res.end()
  }
  try {
    const s = await stat(file)
    const target = s.isDirectory() ? join(file, 'index.html') : file
    const body = await readFile(target)
    res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}${BASE}`))

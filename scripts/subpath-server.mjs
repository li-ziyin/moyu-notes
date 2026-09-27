/**
 * 子路径静态服务器（模拟 GitHub Pages 的 /moyu-notes/ 部署）
 * 用法：node scripts/subpath-server.mjs [port] [docroot] [subpath]
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.argv[2] || 4190)
const DOCROOT = path.resolve(process.argv[3] || '.')
const SUB = (process.argv[4] || '/moyu-notes/').replace(/\/+$/, '') + '/'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
}

http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  // 只服务子路径前缀（模拟 Pages 挂在 /moyu-notes/ 下）；
  // DOCROOT 即部署产物根目录，子路径仅作虚拟前缀剥离
  if (!urlPath.startsWith(SUB) && urlPath !== SUB.replace(/\/$/, '')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('404 — 请访问 /moyu-notes/\n（模拟 GitHub Pages 子路径部署）')
    return
  }
  let filePath = path.join(DOCROOT, urlPath.slice(SUB.length - 1))
  try {
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html')
  } catch {
    // SPA 回退
    filePath = path.join(DOCROOT, 'index.html')
  }
  try {
    const data = fs.readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
}).listen(PORT, () => {
  console.log(`subpath server: http://localhost:${PORT}${SUB} (root: ${DOCROOT})`)
})

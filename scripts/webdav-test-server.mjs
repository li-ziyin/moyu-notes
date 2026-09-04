/**
 * 最小 WebDAV 测试服务器（仅本地开发测试用）
 * 支持 MKCOL / PUT / GET / DELETE / PROPFIND(Depth 0/1)，带 CORS 头
 * 用法：node scripts/webdav-test-server.mjs [port] [rootDir]
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.argv[2] || 5180)
const ROOT = path.resolve(__dirname, process.argv[3] || '../.webdav-root')

fs.mkdirSync(ROOT, { recursive: true })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, MKCOL, PROPFIND, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Depth, Overwrite',
  'Access-Control-Expose-Headers': 'DAV, Content-Length, Last-Modified',
}

function send(res, status, body = '', extra = {}) {
  res.writeHead(status, { ...CORS, ...extra })
  res.end(body)
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const resolved = path.resolve(ROOT, '.' + decoded)
  if (!resolved.startsWith(ROOT)) return null
  return resolved
}

function propfindXml(dirAbs, selfUrlPath) {
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true })
  let xml = `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">`
  // 目录自身
  xml += `<D:response><D:href>${selfUrlPath}</D:href><D:propstat><D:prop>` +
    `<D:resourcetype><D:collection/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`
  for (const entry of entries) {
    const stat = fs.statSync(path.join(dirAbs, entry.name))
    const isDir = entry.isDirectory()
    const href = selfUrlPath.replace(/\/$/, '') + '/' + encodeURIComponent(entry.name)
    xml += `<D:response><D:href>${href}</D:href><D:propstat><D:prop>` +
      `<D:resourcetype>${isDir ? '<D:collection/>' : ''}</D:resourcetype>` +
      `<D:getlastmodified>${stat.mtime.toUTCString()}</D:getlastmodified>` +
      `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`
  }
  xml += `</D:multistatus>`
  return xml
}

const server = http.createServer((req, res) => {
  const urlPath = req.url || '/'
  const abs = safePath(urlPath)

  if (req.method === 'OPTIONS') {
    send(res, 204)
    return
  }
  if (!abs) {
    send(res, 403, 'forbidden')
    return
  }

  if (req.method === 'MKCOL') {
    if (fs.existsSync(abs)) {
      send(res, 405)
      return
    }
    fs.mkdirSync(abs, { recursive: true })
    send(res, 201)
    return
  }

  if (req.method === 'PUT') {
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      fs.writeFileSync(abs, Buffer.concat(chunks))
      send(res, 201)
    })
    return
  }

  if (req.method === 'GET') {
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      send(res, 404)
      return
    }
    send(res, 200, fs.readFileSync(abs, 'utf8'), {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Last-Modified': fs.statSync(abs).mtime.toUTCString(),
    })
    return
  }

  if (req.method === 'DELETE') {
    if (!fs.existsSync(abs)) {
      send(res, 404)
      return
    }
    fs.rmSync(abs, { recursive: true })
    send(res, 204)
    return
  }

  if (req.method === 'PROPFIND') {
    if (!fs.existsSync(abs)) {
      send(res, 404)
      return
    }
    const depth = req.headers.depth || '0'
    if (depth === '0' || !fs.statSync(abs).isDirectory()) {
      const stat = fs.statSync(abs)
      const xml =
        `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">` +
        `<D:response><D:href>${urlPath}</D:href><D:propstat><D:prop>` +
        `<D:resourcetype>${stat.isDirectory() ? '<D:collection/>' : ''}</D:resourcetype>` +
        `<D:getlastmodified>${stat.mtime.toUTCString()}</D:getlastmodified>` +
        `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`
      send(res, 207, xml, { 'Content-Type': 'application/xml; charset=utf-8' })
      return
    }
    const xml = propfindXml(abs, urlPath)
    send(res, 207, xml, { 'Content-Type': 'application/xml; charset=utf-8' })
    return
  }

  send(res, 405, 'method not supported')
})

server.listen(PORT, () => {
  console.log(`WebDAV test server: http://localhost:${PORT}/ (root: ${ROOT})`)
})

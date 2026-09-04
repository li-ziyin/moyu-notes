/**
 * WebDAV 客户端 — 基于 fetch 的最小实现
 * 支持：MKCOL 建目录、PUT 上传、GET 下载、DELETE 删除、PROPFIND 列目录
 * 注意：浏览器直连要求 WebDAV 服务端开启 CORS（自建服务可配，坚果云等不支持直连）
 */

export interface WebDAVConfig {
  url: string // 服务根地址，如 https://dav.example.com/dav/
  username: string
  password: string
  basePath: string // 远程笔记目录，如 moyu-notes/
}

export interface DavFile {
  name: string
  lastModified: number
}

function normalizeBase(url: string): string {
  return url.endsWith('/') ? url : url + '/'
}

function joinUrl(cfg: WebDAVConfig, fileName?: string): string {
  const base = normalizeBase(cfg.url)
  const dir = cfg.basePath
    ? cfg.basePath.replace(/^\/+|\/+$/g, '').split('/').map(encodeURIComponent).join('/') + '/'
    : ''
  return base + dir + (fileName ? encodeURIComponent(fileName) : '')
}

function toBase64Utf8(s: string): string {
  // btoa 不支持非 Latin1 字符（如中文密码），先经 UTF-8 编码
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function headers(cfg: WebDAVConfig, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Basic ${toBase64Utf8(`${cfg.username}:${cfg.password}`)}`,
    ...extra,
  }
}

/** 逐级创建远程目录（WebDAV 不支持递归建目录） */
export async function davEnsureDir(cfg: WebDAVConfig): Promise<void> {
  const base = normalizeBase(cfg.url)
  const segments = cfg.basePath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  let current = base
  for (const seg of segments) {
    current += encodeURIComponent(seg) + '/'
    const res = await fetch(current, {
      method: 'MKCOL',
      headers: headers(cfg),
    })
    // 405 = 目录已存在，视为成功
    if (!res.ok && res.status !== 405) {
      throw new Error(`创建远程目录失败（${res.status}）：请检查地址与账号`)
    }
  }
}

/** 上传文本文件 */
export async function davPut(cfg: WebDAVConfig, fileName: string, content: string): Promise<void> {
  const res = await fetch(joinUrl(cfg, fileName), {
    method: 'PUT',
    headers: headers(cfg, { 'Content-Type': 'text/markdown; charset=utf-8' }),
    body: content,
  })
  if (!res.ok && res.status !== 201 && res.status !== 204) {
    throw new Error(`上传「${fileName}」失败（${res.status}）`)
  }
}

/** 下载文本文件，不存在返回 null */
export async function davGet(cfg: WebDAVConfig, fileName: string): Promise<string | null> {
  const res = await fetch(joinUrl(cfg, fileName), { method: 'GET', headers: headers(cfg) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`下载「${fileName}」失败（${res.status}）`)
  return res.text()
}

/** 删除远程文件，不存在视为成功 */
export async function davDelete(cfg: WebDAVConfig, fileName: string): Promise<void> {
  const res = await fetch(joinUrl(cfg, fileName), { method: 'DELETE', headers: headers(cfg) })
  if (!res.ok && res.status !== 404) {
    throw new Error(`删除「${fileName}」失败（${res.status}）`)
  }
}

/** 列出远程目录下的 .md 文件（不含子目录） */
export async function davList(cfg: WebDAVConfig): Promise<DavFile[]> {
  const res = await fetch(joinUrl(cfg), {
    method: 'PROPFIND',
    headers: headers(cfg, { Depth: '1' }),
  })
  if (res.status === 404) return [] // 目录还没建
  if (!res.ok && res.status !== 207) {
    throw new Error(`读取远程目录失败（${res.status}）：请检查地址与账号`)
  }

  const xml = await res.text()
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const selfHref = new URL(joinUrl(cfg)).pathname
  const out: DavFile[] = []

  for (const response of [...doc.getElementsByTagNameNS('*', 'response')]) {
    const href = response.getElementsByTagNameNS('*', 'href')[0]?.textContent ?? ''
    const isDir = response.getElementsByTagNameNS('*', 'collection').length > 0
    if (isDir) continue
    const name = decodeURIComponent(href.split('/').filter(Boolean).pop() ?? '')
    if (!name.toLowerCase().endsWith('.md')) continue
    // 跳过目录自身
    if (new URL(href, cfg.url).pathname === selfHref) continue
    const lmStr = response.getElementsByTagNameNS('*', 'getlastmodified')[0]?.textContent
    out.push({
      name,
      lastModified: lmStr ? new Date(lmStr).getTime() || 0 : 0,
    })
  }
  return out
}

/** 连接测试：能列目录（或目录尚未创建）即视为通过 */
export async function davTest(cfg: WebDAVConfig): Promise<boolean> {
  const res = await fetch(joinUrl(cfg), {
    method: 'PROPFIND',
    headers: headers(cfg, { Depth: '0' }),
  })
  return res.ok || res.status === 207 || res.status === 404
}

/**
 * 图片资产服务
 * 粘贴的图片存入 IndexedDB，正文以 asset://<id> 引用
 * 渲染时通过 blob URL 缓存转换为可直接显示的地址
 */

import { db } from '@/services/db'

/** assetId → blob URL（会话级缓存） */
const urlCache = new Map<string, string>()

function generateId(): string {
  return crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15)
}

/** 保存图片二进制，返回 asset id */
export async function saveAsset(blob: Blob, articleId: string | null): Promise<string> {
  const id = generateId()
  await db.assets.put({ id, articleId, mime: blob.type, blob, createdAt: Date.now() })
  return id
}

/** 获取 asset 的 blob URL（带缓存），不存在返回 null */
export async function getAssetUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id)
  if (cached) return cached
  const record = await db.assets.get(id)
  if (!record) return null
  const url = URL.createObjectURL(record.blob)
  urlCache.set(id, url)
  return url
}

/** 确保内容中所有 asset:// 引用都已生成 blob URL（渲染前调用） */
export async function ensureAssetUrls(content: string): Promise<void> {
  const ids = [...content.matchAll(/asset:\/\/([a-zA-Z0-9-]+)/g)].map((m) => m[1])
  await Promise.all([...new Set(ids)].map((id) => getAssetUrl(id)))
}

/** 读取已生成的 blob URL（同步，渲染器用） */
export function peekAssetUrl(id: string): string {
  return urlCache.get(id) ?? ''
}

/** 删除某篇文章的全部资产 */
export async function deleteAssetsForArticle(articleId: string): Promise<void> {
  const list = await db.assets.where('articleId').equals(articleId).toArray()
  for (const item of list) {
    const url = urlCache.get(item.id)
    if (url) {
      URL.revokeObjectURL(url)
      urlCache.delete(item.id)
    }
  }
  await db.assets.bulkDelete(list.map((a) => a.id))
}

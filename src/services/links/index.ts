/**
 * 双链服务 — [[笔记标题]] 语法
 * 解析正文中所有 wiki 链接，与 Links 表同步
 * Links 表按 (sourceId, targetTitle, targetId) 建索引，targetId 为空表示目标尚未创建
 */

import { db } from '@/services/db'
import type { Link } from '@/types/article'
import { isEncryptedPayload } from '@/services/crypto'

const WIKI_RE = /\[\[([^[\]\n]+)\]\]/g

/** 从 Markdown 文本中提取所有 wiki 链接目标标题（去重保序） */
export function parseWikiTitles(content: string): string[] {
  const out: string[] = []
  for (const m of content.matchAll(WIKI_RE)) {
    const t = m[1].trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** 按标题解析目标文章 id，未找到返回空串 */
async function resolveTitle(title: string): Promise<string> {
  const art = await db.articles.where('title').equals(title).first()
  return art && art.isDeleted === 0 ? art.id : ''
}

/**
 * 同步某篇文章的双链索引。
 * 返回是否有变化（调用方据此刷新反链/图谱）。
 */
export async function syncLinksForArticle(sourceId: string, content: string): Promise<boolean> {
  const titles = parseWikiTitles(content)
  const targets = await Promise.all(titles.map((t) => resolveTitle(t)))
  const next = titles.map((t, i) => ({
    id: `${sourceId}::${t}`,
    sourceId,
    targetId: targets[i],
    targetTitle: t,
    createdAt: Date.now(),
  }))

  const existing = await db.links.where('sourceId').equals(sourceId).toArray()
  const same =
    existing.length === next.length &&
    existing.every((e) =>
      next.some((n) => n.targetTitle === e.targetTitle && n.targetId === e.targetId)
    )
  if (same) return false

  await db.transaction('rw', db.links, async () => {
    await db.links.where('sourceId').equals(sourceId).delete()
    if (next.length) await db.links.bulkPut(next)
  })
  return true
}

/** 查询指向某篇文章的所有链接（反向链接） */
export async function getBacklinks(articleId: string): Promise<Link[]> {
  return db.links.where('targetId').equals(articleId).toArray()
}

/** 全量链接（知识图谱用） */
export async function getAllLinks(): Promise<Link[]> {
  return db.links.toArray()
}

/**
 * 标题落定后回填：有链接曾指向该标题但目标当时不存在（targetId 为空），
 * 现在目标已创建/重命名，把相关来源的链接重新解析。
 * 返回是否有变化。
 */
export async function resolveLinksForTitle(title: string): Promise<boolean> {
  const target = await db.articles.where('title').equals(title).first()
  if (!target || target.isDeleted !== 0) return false

  const stale = await db.links.where('targetId').equals('').toArray()
  const sources = [
    ...new Set(stale.filter((l) => l.targetTitle === title).map((l) => l.sourceId)),
  ]
  if (sources.length === 0) return false

  let changed = false
  for (const sid of sources) {
    const src = await db.articles.get(sid)
    // 加密笔记的明文不可得，跳过重解析（保持原链接不动）
    if (!src || src.isDeleted !== 0 || src.encrypted === 1 || isEncryptedPayload(src.content)) continue
    const c = await syncLinksForArticle(sid, src.content)
    changed = changed || c
  }
  return changed
}

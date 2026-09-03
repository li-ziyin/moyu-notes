/**
 * 编辑快照服务
 * 每 5 分钟自动创建，每篇文章最多保留 20 个快照
 */

import { db } from '@/services/db'
import type { Snapshot } from '@/types/article'

function generateId(): string {
  return crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15)
}

/** 创建快照 */
export async function createSnapshot(
  articleId: string,
  title: string,
  content: string
): Promise<void> {
  if (!content.trim()) return // 空内容不创建快照
  const snap: Snapshot = {
    id: generateId(),
    articleId,
    title,
    content,
    createdAt: Date.now(),
  }
  await db.snapshots.add(snap)
  await pruneSnapshots(articleId, 20)
}

/** 获取某篇文章的所有快照（最新在前） */
export async function getSnapshots(articleId: string): Promise<Snapshot[]> {
  return db.snapshots
    .where('articleId')
    .equals(articleId)
    .reverse()
    .sortBy('createdAt')
}

/** 删除多余快照，只保留最近 maxCount 个 */
async function pruneSnapshots(articleId: string, maxCount: number): Promise<void> {
  const all = await db.snapshots
    .where('articleId')
    .equals(articleId)
    .reverse()
    .sortBy('createdAt')

  if (all.length <= maxCount) return

  const toDelete = all.slice(maxCount)
  await db.snapshots.bulkDelete(toDelete.map((s) => s.id))
}

/** 删除某篇文章的所有快照 */
export async function deleteAllSnapshots(articleId: string): Promise<void> {
  const snaps = await db.snapshots.where('articleId').equals(articleId).toArray()
  await db.snapshots.bulkDelete(snaps.map((s) => s.id))
}

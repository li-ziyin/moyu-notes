/**
 * WebDAV 同步引擎
 * 策略：双向合并，文件名（笔记标题.md）为对齐键，updatedAt 新者胜
 *  - 本地较新 → 上传；远端较新 → 下载覆盖本地
 *  - 仅远端存在 → 导入为新笔记；本地已软删除 → 删除远端文件
 */

import { davEnsureDir, davPut, davGet, davDelete, davList } from './webdav'
import type { WebDAVConfig } from './webdav'
import { resolveSyncAction } from './timestamp'
import { db } from '@/services/db'
import * as articleDB from '@/services/db/article'
import { createSnapshot } from '@/services/snapshot'
import { isEncryptedPayload } from '@/services/crypto'
import type { Article } from '@/types/article'

// 供 UI 层统一从本模块导入
export { davTest } from './webdav'
export type { WebDAVConfig } from './webdav'

export interface SyncReport {
  uploaded: number
  downloaded: number
  created: number
  removedRemote: number
  conflicts: number
}

/** 远程文件名：清洗标题中的非法字符 */
function safeFileName(title: string): string {
  return `${(title || '未命名').replace(/[\\/:*?"<>|#\[\]]/g, '_')}.md`
}

export async function syncWithWebDAV(
  cfg: WebDAVConfig,
  articles: Article[]
): Promise<SyncReport> {
  const report: SyncReport = {
    uploaded: 0,
    downloaded: 0,
    created: 0,
    removedRemote: 0,
    conflicts: 0,
  }

  await davEnsureDir(cfg)
  const remoteFiles = await davList(cfg)
  const remoteMap = new Map(remoteFiles.map((f) => [f.name, f]))
  const seen = new Set<string>()

  // 1. 逐篇对齐本地未删除笔记
  for (const art of articles.filter((a) => a.isDeleted === 0)) {
    const fileName = safeFileName(art.title)
    if (seen.has(fileName)) continue // 重名标题只同步第一篇
    seen.add(fileName)

    const remote = remoteMap.get(fileName)
    if (!remote) {
      await davPut(cfg, fileName, art.content)
      report.uploaded++
      continue
    }

    // 秒精度归一后决策：本地毫秒 vs 远端秒级 Last-Modified，同秒噪音不动作
    const action = resolveSyncAction(art.updatedAt, remote.lastModified)
    if (action === 'upload') {
      // 本地较新 → 上传
      await davPut(cfg, fileName, art.content)
      report.uploaded++
    } else if (action === 'download') {
      // 远端较新
      // 加密笔记的密文不可在应用外解密，拒绝远端明文覆盖（需在应用内手动处理）
      if (art.encrypted === 1 || isEncryptedPayload(art.content)) {
        report.conflicts++
        continue
      }
      const remoteContent = await davGet(cfg, fileName)
      if (remoteContent !== null && remoteContent !== art.content) {
        // 覆盖前把本地当前内容存为快照，本地未同步的修改永远可找回
        await createSnapshot(art.id, art.title, art.content, '同步覆盖前备份')
        await articleDB.updateArticle(art.id, {
          content: remoteContent,
          updatedAt: remote.lastModified,
        })
        report.downloaded++
      }
    }
  }

  // 2. 远端独有文件 → 导入为新笔记
  const localTitles = new Set(
    articles.filter((a) => a.isDeleted === 0).map((a) => safeFileName(a.title))
  )
  for (const [fileName, remote] of remoteMap) {
    if (seen.has(fileName) || localTitles.has(fileName)) continue
    const content = await davGet(cfg, fileName)
    if (content === null) continue
    const title = fileName.replace(/\.md$/i, '')
    await articleDB.createArticle({
      title,
      content,
      folderId: null,
      tags: [],
      filePath: null,
    })
    // 让新笔记的 updatedAt 与远端一致，避免下次回传
    // （直接走 Dexie 原始 update，绕开会强制刷新时间戳的 articleDB.updateArticle）
    const created = await db.articles.where('title').equals(title).first()
    if (created) {
      await db.articles.update(created.id, { updatedAt: remote.lastModified })
    }
    report.created++
  }

  // 3. 本地软删除 → 清理远端对应文件
  for (const art of articles.filter((a) => a.isDeleted === 1)) {
    const fileName = safeFileName(art.title)
    if (remoteMap.has(fileName) && !seen.has(fileName)) {
      await davDelete(cfg, fileName)
      report.removedRemote++
    }
  }

  return report
}

// ── 配置持久化（仅存本机浏览器） ──

const CONFIG_KEY = 'moyu.webdav.config'
const LAST_SYNC_KEY = 'moyu.webdav.lastSync'

export function loadSyncConfig(): WebDAVConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw) as WebDAVConfig
    return cfg.url && cfg.username ? cfg : null
  } catch {
    return null
  }
}

export function saveSyncConfig(cfg: WebDAVConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
}

export function clearSyncConfig(): void {
  localStorage.removeItem(CONFIG_KEY)
  localStorage.removeItem(LAST_SYNC_KEY)
}

export function getLastSyncTime(): number {
  return Number(localStorage.getItem(LAST_SYNC_KEY) || 0)
}

export function setLastSyncTime(ts: number): void {
  localStorage.setItem(LAST_SYNC_KEY, String(ts))
}

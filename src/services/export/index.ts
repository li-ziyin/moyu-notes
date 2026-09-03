/**
 * 导入导出服务
 * - 单篇导出为 .md 下载
 * - 全部导出为 zip 包（jszip）
 */

import JSZip from 'jszip'
import { db } from '@/services/db'
import type { Article } from '@/types/article'

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 导出单篇笔记（content 为最终落盘文本，加密笔记传密文或明文由调用方决定） */
export function exportArticle(art: Article, content: string): void {
  const name = `${(art.title || '未命名').replace(/[\\/:*?"<>|]/g, '_')}.md`
  download(new Blob([content], { type: 'text/markdown;charset=utf-8' }), name)
}

/** 导出全部笔记为 zip（加密笔记导出密文原文） */
export async function exportAllZip(): Promise<void> {
  const articles = await db.articles.where('isDeleted').equals(0).toArray()
  const zip = new JSZip()
  const used = new Set<string>()

  for (const a of articles) {
    let name = `${(a.title || '未命名').replace(/[\\/:*?"<>|]/g, '_')}.md`
    let i = 1
    while (used.has(name)) name = name.replace(/\.md$/, ` (${i++}).md`)
    used.add(name)
    zip.file(name, a.content)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  download(blob, `墨语笔记-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.zip`)
}

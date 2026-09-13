/**
 * 导入导出服务
 * - 单篇导出为 .md 下载（图片资产内联为 data URL）
 * - 全部导出为 zip 包（jszip 按需动态加载，不占首屏体积）
 */

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

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  }
  return map[mime] || 'png'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** 清洗标题中的非法字符（与同步模块规则一致） */
function safeName(title: string): string {
  return (title || '未命名').replace(/[\\/:*?"<>|#\[\]]/g, '_')
}

/**
 * 把内容中的 asset://<id> 引用替换为 data URL（单篇导出用，图片内联进文件）。
 * 找不到的资产保留原引用。
 */
export async function inlineAssetRefs(content: string): Promise<string> {
  const ids = [...content.matchAll(/asset:\/\/([a-zA-Z0-9-]+)/g)].map((m) => m[1])
  let out = content
  for (const id of new Set(ids)) {
    const asset = await db.assets.get(id)
    if (!asset) continue
    const b64 = await blobToBase64(asset.blob)
    out = out.replaceAll(`asset://${id}`, `data:${asset.mime};base64,${b64}`)
  }
  return out
}

/** 导出单篇笔记（自动内联图片资产） */
export async function exportArticle(art: Article, content: string): Promise<void> {
  const finalContent = art.encrypted === 1 ? content : await inlineAssetRefs(content)
  const name = `${safeName(art.title)}.md`
  download(new Blob([finalContent], { type: 'text/markdown;charset=utf-8' }), name)
}

/** 导出全部笔记为 zip：图片资产收入 assets/ 目录并改写引用 */
export async function exportAllZip(): Promise<void> {
  const { default: JSZip } = await import('jszip') // 按需加载
  const zip = new JSZip()
  const articles = await db.articles.where('isDeleted').equals(0).toArray()
  const assetsFolder = zip.folder('assets')
  const used = new Set<string>()
  let assetCount = 0
  let encryptedCount = 0

  for (const a of articles) {
    let name = `${safeName(a.title)}.md`
    let i = 1
    while (used.has(name)) name = name.replace(/\.md$/, ` (${i++}).md`)
    used.add(name)

    let content = a.content

    // 非加密笔记：图片资产写入 assets/ 并改写引用；加密笔记保持密文原样
    if (a.encrypted !== 1) {
      const ids = [...content.matchAll(/asset:\/\/([a-zA-Z0-9-]+)/g)].map((m) => m[1])
      for (const id of new Set(ids)) {
        const asset = await db.assets.get(id)
        if (!asset) continue
        const fileName = `${id}.${extFromMime(asset.mime)}`
        assetsFolder?.file(fileName, asset.blob)
        content = content.replaceAll(`asset://${id}`, `assets/${fileName}`)
        assetCount++
      }
    } else {
      encryptedCount++
    }

    zip.file(name, content)
  }

  // 打包说明
  zip.file(
    '说明.txt',
    [
      '墨语笔记导出包',
      '',
      `- 笔记 ${articles.length} 篇${encryptedCount ? `（其中 ${encryptedCount} 篇为加密密文，需在应用内解锁后查看）` : ''}`,
      assetCount ? `- 图片资产 ${assetCount} 张，位于 assets/ 目录` : '',
      '',
      '加密笔记内容为 AES-GCM 密文，仅可通过墨语笔记应用解锁查看。',
    ]
      .filter(Boolean)
      .join('\n')
  )

  const blob = await zip.generateAsync({ type: 'blob' })
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  download(blob, `墨语笔记-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.zip`)
}

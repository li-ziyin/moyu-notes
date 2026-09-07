/**
 * 双链语法（纯函数）：[[笔记标题]] 解析
 */

export const WIKI_RE = /\[\[([^[\]\n]+)\]\]/g

/** 从 Markdown 文本中提取所有 wiki 链接目标标题（去重保序） */
export function parseWikiTitles(content: string): string[] {
  const out: string[] = []
  for (const m of content.matchAll(WIKI_RE)) {
    const t = m[1].trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

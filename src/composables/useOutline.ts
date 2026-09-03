/**
 * Markdown 大纲解析
 * 从内容中提取所有 # 标题，生成带层级的导航列表
 */

export interface OutlineItem {
  level: number // 1-6
  text: string
  line: number // 在原内容中的行号（1-based）
}

/** 从 Markdown 文本中解析标题，生成大纲 */
export function parseOutline(content: string): OutlineItem[] {
  const lines = content.split('\n')
  const items: OutlineItem[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      items.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i + 1,
      })
    }
  }

  return items
}

/**
 * 智能续行 — 纯文本逻辑，不与编辑器耦合
 *
 * 支持（含任意行首缩进）：
 *  - 无序列表：- * +
 *  - 有序列表：1. 2. 3. …（自动递增）
 *  - 引用块：> >> >
 *  - 代码块：``` 开始，``` 结束（由编辑器层处理闭合）
 */

/** 无序列表前缀匹配，返回完整前缀（含缩进）如 "  - " */
function matchUnordered(line: string): string | null {
  const m = line.match(/^(\s*)([-*+])\s/)
  return m ? m[0] : null
}

/** 有序列表前缀匹配，返回完整前缀（含缩进）如 "12. " */
function matchOrdered(line: string): string | null {
  const m = line.match(/^(\s*)(\d+)\.\s/)
  // 过滤掉太长的"有序列表"（可能是年份等），只认 1-999
  if (m && parseInt(m[2]) <= 999) return m[0]
  return null
}

/** 引用块前缀匹配，返回完整前缀如 "> " "> > " */
function matchBlockquote(line: string): string | null {
  const m = line.match(/^(\s*)(>\s)+/)
  return m ? m[0] : null
}

export type ListType = 'unordered' | 'ordered' | 'blockquote'

export interface ListPrefix {
  type: ListType
  prefix: string // 当前行匹配到的前缀（含缩进），如 "- "、"12. "
}

/** 检测当前行的列表/引用前缀 */
export function detectPrefix(line: string): ListPrefix | null {
  const u = matchUnordered(line)
  if (u) return { type: 'unordered', prefix: u }

  const o = matchOrdered(line)
  if (o) return { type: 'ordered', prefix: o }

  const b = matchBlockquote(line)
  if (b) return { type: 'blockquote', prefix: b }

  return null
}

/** 当前行有内容，回车后应该续行 */
export function shouldContinue(line: string): boolean {
  const p = detectPrefix(line)
  if (!p) return false
  return line.trim().length > p.prefix.trim().length
}

/** 当前行只有前缀（空列表项），回车后应退出续行 */
export function shouldExit(line: string): boolean {
  const p = detectPrefix(line)
  if (!p) return false
  return line.trim() === p.prefix.trim()
}

/** 获取续行的下一行前缀。有序列表自动 +1 */
export function getNextPrefix(line: string): string | null {
  const p = detectPrefix(line)
  if (!p) return null

  switch (p.type) {
    case 'unordered':
    case 'blockquote':
      return p.prefix
    case 'ordered': {
      const m = p.prefix.match(/(\d+)\.\s$/)
      if (!m) return p.prefix
      return `${parseInt(m[1]) + 1}. `
    }
  }
  return null
}

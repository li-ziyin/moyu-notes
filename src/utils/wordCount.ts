/**
 * 字数统计（纯函数）：CJK 字符逐字计 1，拉丁字母数字串计 1
 */

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/g
const LATIN_WORD_RE = /[a-zA-Z0-9]+/g

export function countWords(text: string): number {
  const cjk = (text.match(CJK_RE) || []).length
  const latin = (text.match(LATIN_WORD_RE) || []).length
  return cjk + latin
}

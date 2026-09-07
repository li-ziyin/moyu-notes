/**
 * 搜索文本预处理（纯函数）
 * 中文按二元分词（CJK bigram），英文按小写单词，供 FlexSearch encode:false 索引与查询
 */

/** 拉丁单词段 / CJK 连续段 */
const SEG_RE = /([a-zA-Z0-9]+)|([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+)/g

/**
 * 搜索文本预处理：
 *  - 拉丁段 → 小写单词
 *  - CJK 段 → 2-gram 序列（"中文搜索" → "中文 文搜 搜索"），单字保留单字
 * 配合 tokenize:'forward'，长度 ≥2 的任意中文子串、拉丁前缀均可命中
 */
export function prepareSearchText(text: string): string {
  const tokens: string[] = []
  for (const m of text.matchAll(SEG_RE)) {
    if (m[1]) {
      tokens.push(m[1].toLowerCase())
    } else {
      const run = m[2]
      if (run.length === 1) {
        tokens.push(run)
      } else {
        for (let i = 0; i < run.length - 1; i++) {
          tokens.push(run.slice(i, i + 2))
        }
      }
    }
  }
  return tokens.join(' ')
}

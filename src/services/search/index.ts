/**
 * FlexSearch 全文搜索服务
 * 中文按二元分词（CJK bigram）预处理后索引，任意中文子串可命中；
 * 英文按单词索引，大小写不敏感。
 * FlexSearch 配置 encode:false，分词由本模块全权负责。
 */

import { Document } from 'flexsearch'
import type { Article } from '@/types/article'
import { prepareSearchText } from '@/utils/searchText'

export interface SearchDoc {
  id: string
  title: string
  content: string
}

const docMap = new Map<string, SearchDoc>()

/** 加密笔记不索引内容，只索引标题 */
function docContent(a: Article): string {
  return a.encrypted === 1 ? '' : a.content
}

const index = new Document({
  document: {
    id: 'id',
    index: ['title', 'content'],
  },
  tokenize: 'forward',
  encode: false,
} as never)

/** 从文章列表构建索引 */
export function buildIndex(articles: Article[]): void {
  docMap.clear()
  for (const a of articles) {
    if (a.isDeleted) continue
    const doc: SearchDoc = { id: a.id, title: a.title, content: docContent(a) }
    docMap.set(a.id, doc)
    index.add(a.id, {
      id: a.id,
      title: prepareSearchText(a.title),
      content: prepareSearchText(doc.content),
    } as never)
  }
}

/** 更新/添加单篇文章索引 */
export function updateDoc(article: Article): void {
  const doc: SearchDoc = { id: article.id, title: article.title, content: docContent(article) }
  docMap.set(article.id, doc)
  index.update(article.id, {
    id: article.id,
    title: prepareSearchText(doc.title),
    content: prepareSearchText(doc.content),
  } as never)
}

/** 从索引中移除 */
export function removeDoc(id: string): void {
  docMap.delete(id)
  index.remove(id)
}

/** 搜索，返回匹配文档列表 */
export function search(query: string): SearchDoc[] {
  const prepared = prepareSearchText(query)
  if (!prepared.trim()) return []
  const rawResults = index.search(prepared, { limit: 15, enrich: true })
  const ids = new Set<string>()

  for (const fieldResult of rawResults) {
    for (const item of fieldResult.result) {
      // enrich:true 时每个 item 是 { id, doc }
      const id = typeof item === 'string' ? item : (item as any).id
      ids.add(String(id))
    }
  }

  return [...ids].map((id) => docMap.get(id)!).filter(Boolean)
}

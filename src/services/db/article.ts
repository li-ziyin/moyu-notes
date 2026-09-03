import { db } from './index'
import type { Article } from '@/types/article'

function generateId(): string {
  return crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15)
}

export async function createArticle(
  article: Omit<Article, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'wordCount'>
): Promise<string> {
  const now = Date.now()
  const id = generateId()
  const wordCount = article.content?.length || 0

  await db.articles.add({
    ...article,
    id,
    createdAt: now,
    updatedAt: now,
    isDeleted: 0,
    wordCount,
    filePath: article.filePath ?? null,
  })

  return id
}

export async function updateArticle(id: string, changes: Partial<Article>): Promise<void> {
  const updates: any = { ...changes, updatedAt: Date.now() }
  if (changes.content !== undefined) {
    updates.wordCount = changes.content.length
  }
  await db.articles.update(id, updates)
}

export async function getArticle(id: string): Promise<Article | undefined> {
  return db.articles.get(id)
}

/** 通过 filePath 查找文章 */
export async function getArticleByPath(filePath: string): Promise<Article | undefined> {
  return db.articles.where('filePath').equals(filePath).first()
}

export async function getAllArticles(): Promise<Article[]> {
  return db.articles.where('isDeleted').equals(0).reverse().sortBy('updatedAt')
}

export async function deleteArticle(id: string): Promise<void> {
  await db.articles.update(id, { isDeleted: 1, updatedAt: Date.now() })
}
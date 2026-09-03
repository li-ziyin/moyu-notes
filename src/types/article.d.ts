export interface Article {
  id: string
  title: string
  content: string
  folderId: string | null
  tags: string[]
  createdAt: number
  updatedAt: number
  isDeleted: number  // 修改：boolean → number（0=正常, 1=已删除）
  wordCount: number
  filePath: string | null  // 文件系统模式下的 .md 文件名
}

// Folder 和 Link 不变
export interface Folder {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: number
}

export interface Link {
  id: string
  sourceId: string
  targetId: string
  targetTitle: string
  createdAt: number
}

/** 编辑快照 */
export interface Snapshot {
  id: string
  articleId: string
  title: string
  content: string
  createdAt: number
}
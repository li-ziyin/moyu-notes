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
  encrypted?: number  // 1 = 内容已用 AES-GCM 加密（content 存密文）
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
  /** 自动备份来源说明（如"同步覆盖前备份"），手动快照无此字段 */
  label?: string
}

/** 图片资产（粘贴的图片二进制，正文以 asset://<id> 引用） */
export interface Asset {
  id: string
  articleId: string | null
  mime: string
  blob: Blob
  createdAt: number
}
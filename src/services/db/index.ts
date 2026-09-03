import Dexie, { Table } from 'dexie'
import type { Article, Folder, Link, Snapshot } from '@/types/article'

export interface WorkspaceRecord {
  id: string // 'default'
  directoryHandle: FileSystemDirectoryHandle | null
  directoryName: string
}

export class MoyuDatabase extends Dexie {
  articles!: Table<Article>
  folders!: Table<Folder>
  links!: Table<Link>
  snapshots!: Table<Snapshot>
  workspaces!: Table<WorkspaceRecord>

  constructor() {
    super('MoyuNotesDB')
    this.version(1).stores({
      articles: 'id, folderId, title, updatedAt, isDeleted',
      folders: 'id, parentId, sortOrder',
      links: 'id, sourceId, targetId',
    })
    this.version(2).stores({
      articles: 'id, folderId, title, updatedAt, isDeleted, filePath',
      workspaces: 'id',
    })
    this.version(3).stores({
      snapshots: 'id, articleId, createdAt',
    })
  }
}

export const db = new MoyuDatabase()
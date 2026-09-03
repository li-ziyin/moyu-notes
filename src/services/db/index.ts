import Dexie, { Table } from 'dexie'
import type { Article, Folder, Link, Snapshot, Asset } from '@/types/article'

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
  assets!: Table<Asset>

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
    this.version(4).stores({
      assets: 'id, articleId',
    })
  }
}

export const db = new MoyuDatabase()
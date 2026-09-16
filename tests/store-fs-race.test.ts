/**
 * C-1 竞态回归测试（code-reviewer 审查发现）：
 * watch(currentArticle) 是异步回调，FS 模式下快速切换文章时，
 * 慢速磁盘读取的过期结果不得覆盖当前文章的内容。
 *
 * 修复前：currentContent 会被迟到的 A 文件内容覆盖（下一步自动保存
 * 就会把 A 的内容写进 B 的文件，静默损坏数据）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── 共享的可控 mock 状态 ──
const mocks = vi.hoisted(() => ({
  /** 文件 A 的磁盘读取：由测试手动 resolve，模拟慢 IO */
  slowResolveA: null as null | ((v: string) => void),
}))

vi.mock('@/services/fs', () => ({
  scanDirectory: vi.fn(async () => [
    { name: 'a.md', handle: 'hA', lastModified: 1000 },
    { name: 'b.md', handle: 'hB', lastModified: 1000 },
  ]),
  readFile: vi.fn(async (handle: string) => {
    if (handle === 'hA') {
      return new Promise<string>((resolve) => {
        mocks.slowResolveA = resolve
      })
    }
    return 'B 的内容'
  }),
  createFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  renameFile: vi.fn(),
  pickDirectory: vi.fn(),
  restoreWorkspace: vi.fn(),
  closeWorkspace: vi.fn(),
  importFile: vi.fn(),
  isActive: vi.fn(() => false),
  currentName: vi.fn(() => ''),
}))

vi.mock('@/services/db', () => ({
  db: {
    workspaces: { get: vi.fn(async () => undefined), put: vi.fn(), delete: vi.fn() },
    folders: { toArray: vi.fn(async () => []), put: vi.fn(), update: vi.fn(), delete: vi.fn() },
    articles: { get: vi.fn(), update: vi.fn(), delete: vi.fn() },
    links: { toArray: vi.fn(async () => []) },
    snapshots: { add: vi.fn(), where: vi.fn() },
    assets: { get: vi.fn(), put: vi.fn() },
    transaction: vi.fn(),
  },
  MoyuDatabase: class {},
}))

vi.mock('@/services/db/article', () => {
  const artA = {
    id: 'a', title: 'A', content: 'A 旧', folderId: null, tags: [],
    createdAt: 0, updatedAt: 900, isDeleted: 0, wordCount: 0, filePath: 'a.md',
  }
  const artB = {
    id: 'b', title: 'B', content: 'B 旧', folderId: null, tags: [],
    createdAt: 0, updatedAt: 900, isDeleted: 0, wordCount: 0, filePath: 'b.md',
  }
  const records = [artA, artB]
  return {
    getAllArticles: vi.fn(async () => records),
    getArticleByPath: vi.fn(async (name: string) => records.find((r) => r.filePath === name)),
    updateArticle: vi.fn(async (id: string, changes: object) => {
      const r = records.find((x) => x.id === id)
      if (r) Object.assign(r, changes)
    }),
    createArticle: vi.fn(),
    deleteArticle: vi.fn(),
  }
})

vi.mock('@/services/search', () => ({
  buildIndex: vi.fn(),
  updateDoc: vi.fn(),
  removeDoc: vi.fn(),
}))

vi.mock('@/services/links', () => ({
  syncLinksForArticle: vi.fn(async () => false),
  getBacklinks: vi.fn(async () => []),
  resolveLinksForTitle: vi.fn(async () => false),
}))

vi.mock('@/services/snapshot', () => ({
  createSnapshot: vi.fn(),
  deleteAllSnapshots: vi.fn(),
}))

vi.mock('@/services/assets', () => ({
  deleteAssetsForArticle: vi.fn(),
}))

// crypto 用真实实现（Node 原生 WebCrypto）

import { setActivePinia, createPinia } from 'pinia'
import { useArticleStore } from '@/stores/article'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('store：FS 模式文章切换竞态（C-1）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('快速切换文章后，迟到的磁盘读取结果不得覆盖当前文章内容', async () => {
    const store = useArticleStore()
    store.isFsMode = true
    await store.syncFsArticles()

    // 选中 A → readFile(hA) 挂起（慢速磁盘）
    store.selectArticle('a')
    await sleep(30)
    // 切到 B → readFile(hB) 立即返回
    store.selectArticle('b')
    await sleep(30)
    expect(store.currentContent).toBe('B 的内容')

    // A 的磁盘读取此刻才返回 → 不得覆盖 B
    mocks.slowResolveA!('A 的内容（迟到的磁盘读取）')
    await sleep(30)

    expect(store.currentContent).toBe('B 的内容')
  })
})

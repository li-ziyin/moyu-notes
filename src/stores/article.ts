import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Article } from '@/types/article'
import * as articleDB from '@/services/db/article'
import { db } from '@/services/db'
import * as fsService from '@/services/fs'
import { updateDoc as searchUpdate, removeDoc as searchRemove } from '@/services/search'
import { createSnapshot } from '@/services/snapshot'

export const useArticleStore = defineStore('article', () => {
  const articles = ref<Article[]>([])
  const currentArticleId = ref<string | null>(null)
  /** 当前文章实时内容，EditorArea 直接写入，PreviewArea 直接读取，预览零延迟 */
  const currentContent = ref('')

  // ── 文件系统模式 ──
  const isFsMode = ref(false)
  const workspaceName = ref('')

  /** 文件句柄缓存：articleId → FileSystemFileHandle */
  const fileHandles = new Map<string, FileSystemFileHandle>()

  const currentArticle = computed(() =>
    articles.value.find((a) => a.id === currentArticleId.value) || null
  )

  // 切换文章时同步 currentContent；FS 模式下从文件读取
  watch(currentArticle, async (article) => {
    if (!article) {
      currentContent.value = ''
      return
    }
    if (isFsMode.value && article.filePath) {
      const handle = fileHandles.get(article.id)
      if (handle) {
        currentContent.value = await fsService.readFile(handle)
      } else {
        currentContent.value = article.content
      }
    } else {
      currentContent.value = article.content
    }
  })

  // ── 工作区管理 ──

  /** 初始化：尝试恢复之前保存的工作目录 */
  const initWorkspace = async () => {
    const record = await db.workspaces.get('default')
    if (record?.directoryHandle) {
      const ws = await fsService.restoreWorkspace(record.directoryHandle)
      if (ws) {
        isFsMode.value = true
        workspaceName.value = ws.directoryName
        await syncFsArticles()
        return
      }
    }
    // 回退：纯 IndexedDB 模式
    await loadArticles()
  }

  /** 打开文件夹 */
  const openFolder = async () => {
    const ws = await fsService.pickDirectory()
    isFsMode.value = true
    workspaceName.value = ws.directoryName

    // 持久化目录句柄
    await db.workspaces.put({
      id: 'default',
      directoryHandle: ws.directoryHandle,
      directoryName: ws.directoryName,
    })
    await syncFsArticles()
  }

  /** 关闭工作目录，回到纯 IndexedDB 模式 */
  const closeWorkspace = async () => {
    fsService.closeWorkspace()
    fileHandles.clear()
    isFsMode.value = false
    workspaceName.value = ''
    currentArticleId.value = null
    currentContent.value = ''
    await db.workspaces.delete('default')
    await loadArticles()
  }

  /** 扫描工作目录，与 IndexedDB 同步 */
  const syncFsArticles = async () => {
    const fileEntries = await fsService.scanDirectory()
    const synced: Article[] = []

    for (const entry of fileEntries) {
      const existing = await articleDB.getArticleByPath(entry.name)
      if (existing && existing.isDeleted === 0) {
        // 已有记录，复用
        synced.push(existing)
      } else if (existing && existing.isDeleted === 1) {
        // 之前软删除了，恢复
        await articleDB.updateArticle(existing.id, { isDeleted: 0, updatedAt: Date.now() })
        synced.push({ ...existing, isDeleted: 0 })
      } else {
        // 新文件，创建记录
        const title = entry.name.replace(/\.md$/, '')
        const content = await fsService.readFile(entry.handle)
        const id = await articleDB.createArticle({
          title,
          content,
          folderId: null,
          tags: [],
          filePath: entry.name,
        })
        synced.push({
          id,
          title,
          content,
          folderId: null,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isDeleted: 0,
          wordCount: content.length,
          filePath: entry.name,
        })
      }
      // 缓存文件句柄
      const art = synced.find((a) => a.filePath === entry.name)
      if (art) fileHandles.set(art.id, entry.handle)
    }

    articles.value = synced.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  // ── 标签栏 ──
  const openTabs = ref<string[]>([])

  function openTab(id: string) {
    if (!openTabs.value.includes(id)) {
      openTabs.value.push(id)
    }
    currentArticleId.value = id
  }

  function closeTab(id: string) {
    const idx = openTabs.value.indexOf(id)
    if (idx === -1) return
    openTabs.value.splice(idx, 1)
    if (currentArticleId.value === id) {
      // 切换到相邻标签
      const next = openTabs.value[idx] ?? openTabs.value[idx - 1] ?? null
      currentArticleId.value = next
      if (next) {
        const art = articles.value.find((a) => a.id === next)
        currentContent.value = art?.content ?? ''
      } else {
        currentContent.value = ''
      }
    }
  }

  // ── CRUD ──

  const loadArticles = async () => {
    articles.value = await articleDB.getAllArticles()
  }

  const createArticle = async () => {
    if (isFsMode.value) {
      // 文件系统模式：在工作目录创建 .md 文件
      const existingNames = new Set(articles.value.map((a) => a.title))
      let title = '未命名'
      let counter = 1
      while (existingNames.has(title)) {
        title = `未命名 (${counter})`
        counter++
      }

      const fileName = `${title}.md`
      const handle = await fsService.createFile(fileName, '')
      const id = await articleDB.createArticle({
        title,
        content: '',
        folderId: null,
        tags: [],
        filePath: fileName,
      })
      fileHandles.set(id, handle)

      articles.value.unshift({
        id,
        title,
        content: '',
        folderId: null,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isDeleted: 0,
        wordCount: 0,
        filePath: fileName,
      })
      searchUpdate(articles.value[0])
      currentArticleId.value = id
      currentContent.value = ''
      return id
    }

    // IndexedDB 模式
    const existingNames = new Set(articles.value.map((a) => a.title))
    let title = '未命名'
    let counter = 1
    while (existingNames.has(title)) {
      title = `未命名 (${counter})`
      counter++
    }

    const id = await articleDB.createArticle({
      title,
      content: '',
      folderId: null,
      tags: [],
      filePath: null,
    })
    await loadArticles()
    const art = articles.value.find((a) => a.id === id)
    if (art) searchUpdate(art)
    currentArticleId.value = id
    currentContent.value = ''
    return id
  }

  const selectArticle = (id: string) => {
    openTab(id)
  }

  const updateCurrentArticle = async (changes: Partial<Article>) => {
    if (!currentArticleId.value) return

    await articleDB.updateArticle(currentArticleId.value, changes)

    // 文件系统模式：写回文件
    if (isFsMode.value && changes.content !== undefined) {
      const art = articles.value.find((a) => a.id === currentArticleId.value)
      if (art?.filePath) {
        const handle = fileHandles.get(currentArticleId.value)
        if (handle) {
          await fsService.writeFile(handle, changes.content)
        }
      }
    }

    // 文件系统模式下处理标题变更 → 重命名文件
    if (isFsMode.value && changes.title !== undefined) {
      const art = articles.value.find((a) => a.id === currentArticleId.value)
      if (art?.filePath) {
        const handle = fileHandles.get(currentArticleId.value)
        if (handle) {
          const newFileName = `${changes.title}.md`
          const newHandle = await fsService.renameFile(handle, newFileName)
          fileHandles.set(currentArticleId.value, newHandle)
          await articleDB.updateArticle(currentArticleId.value, { filePath: newFileName })
          const idx = articles.value.findIndex((a) => a.id === currentArticleId.value)
          if (idx !== -1) {
            articles.value[idx] = { ...articles.value[idx], filePath: newFileName }
          }
        }
      }
    }

    const idx = articles.value.findIndex((a) => a.id === currentArticleId.value)
    if (idx !== -1) {
      articles.value[idx] = { ...articles.value[idx], ...changes, updatedAt: Date.now() }
      searchUpdate(articles.value[idx])
    }
  }

  const deleteCurrentArticle = async () => {
    if (!currentArticleId.value) return

    const art = articles.value.find((a) => a.id === currentArticleId.value)

    // 文件系统模式：删除文件
    if (isFsMode.value && art?.filePath) {
      const handle = fileHandles.get(currentArticleId.value)
      if (handle) {
        await fsService.deleteFile(handle)
        fileHandles.delete(currentArticleId.value)
      }
    }

    await articleDB.deleteArticle(currentArticleId.value)
    searchRemove(currentArticleId.value)
    if (isFsMode.value) {
      articles.value = articles.value.filter((a) => a.id !== currentArticleId.value)
    } else {
      await loadArticles()
    }
    // 清理标签栏
    const deletedId = currentArticleId.value
    const tabIdx = openTabs.value.indexOf(deletedId!)
    if (tabIdx !== -1) openTabs.value.splice(tabIdx, 1)
    currentArticleId.value = null
    currentContent.value = ''
  }

  /** 导入外部 .md 文件到当前工作目录 */
  const importMarkdownFile = async () => {
    if (!isFsMode.value) throw new Error('请先打开工作目录')
    const entry = await fsService.importFile()
    if (!entry) return

    const content = await fsService.readFile(entry.handle)
    const title = entry.name.replace(/\.md$/, '')
    const id = await articleDB.createArticle({
      title,
      content,
      folderId: null,
      tags: [],
      filePath: entry.name,
    })
    fileHandles.set(id, entry.handle)

    articles.value.unshift({
      id,
      title,
      content,
      folderId: null,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: 0,
      wordCount: content.length,
      filePath: entry.name,
    })
  }

  // ── 自动快照（每 5 分钟） ──
  let snapshotTimer: ReturnType<typeof setInterval> | null = null

  function startAutoSnapshot() {
    if (snapshotTimer) return
    snapshotTimer = setInterval(() => {
      const art = currentArticle.value
      if (art && currentContent.value.trim()) {
        createSnapshot(art.id, art.title, currentContent.value)
      }
    }, 5 * 60 * 1000) // 5 分钟
  }

  function stopAutoSnapshot() {
    if (snapshotTimer) {
      clearInterval(snapshotTimer)
      snapshotTimer = null
    }
  }

  // 初始化时启动
  startAutoSnapshot()

  // ── 回收站 ──
  const trashArticles = ref<Article[]>([])
  const showTrash = ref(false)

  async function loadTrash() {
    trashArticles.value = await db.articles
      .where('isDeleted')
      .equals(1)
      .reverse()
      .sortBy('updatedAt')
  }

  async function restoreArticle(id: string) {
    await articleDB.updateArticle(id, { isDeleted: 0, updatedAt: Date.now() })
    await loadArticles()
    await loadTrash()
  }

  async function permanentlyDeleteArticle(id: string) {
    await db.articles.delete(id)
    searchRemove(id)
    await loadTrash()
  }

  function toggleTrash() {
    showTrash.value = !showTrash.value
    if (showTrash.value) loadTrash()
  }

  return {
    articles,
    currentArticleId,
    currentArticle,
    currentContent,
    openTabs,
    openTab,
    closeTab,
    trashArticles,
    showTrash,
    loadTrash,
    restoreArticle,
    permanentlyDeleteArticle,
    toggleTrash,
    stopAutoSnapshot,
    isFsMode,
    workspaceName,
    initWorkspace,
    openFolder,
    closeWorkspace,
    importMarkdownFile,
    loadArticles,
    createArticle,
    updateCurrentArticle,
    selectArticle,
    deleteCurrentArticle,
  }
})

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Article } from '@/types/article'
import * as articleDB from '@/services/db/article'
import { db } from '@/services/db'
import * as fsService from '@/services/fs'
import { updateDoc as searchUpdate, removeDoc as searchRemove } from '@/services/search'
import { createSnapshot, deleteAllSnapshots } from '@/services/snapshot'
import { deleteAssetsForArticle } from '@/services/assets'
import { encryptText, decryptText, isEncryptedPayload } from '@/services/crypto'
import { syncLinksForArticle, getBacklinks, resolveLinksForTitle } from '@/services/links'
import { buildIndex } from '@/services/search'

export const useArticleStore = defineStore('article', () => {
  const articles = ref<Article[]>([])
  const currentArticleId = ref<string | null>(null)
  /** 当前文章实时内容，EditorArea 直接写入，PreviewArea 直接读取，预览零延迟 */
  const currentContent = ref('')

  // ── 文件系统模式 ──
  const isFsMode = ref(false)
  const workspaceName = ref('')

  /** 页面加载时目录句柄存在但权限未授予（浏览器要求手势），等用户手动重连 */
  const pendingWorkspace = ref<{ name: string; handle: FileSystemDirectoryHandle } | null>(null)

  /** 文件句柄缓存：articleId → FileSystemFileHandle */
  const fileHandles = new Map<string, FileSystemFileHandle>()

  const currentArticle = computed(() =>
    articles.value.find((a) => a.id === currentArticleId.value) || null
  )

  // ── 加密状态 ──
  /** 本次会话已解锁的文章 id（切换文章后仍保持解锁） */
  const unlockedIds = ref<string[]>([])
  /** 解锁密码缓存（仅内存，用于编辑时自动重新加密） */
  const passwordCache = new Map<string, string>()

  const currentEncrypted = computed(() => {
    const art = currentArticle.value
    return !!art && (art.encrypted === 1 || isEncryptedPayload(art.content))
  })

  const currentLocked = computed(
    () => currentEncrypted.value && !unlockedIds.value.includes(currentArticleId.value ?? '')
  )

  // 切换文章时同步 currentContent；加密文章未解锁时内容置空
  watch(currentArticle, async (article) => {
    if (!article) {
      currentContent.value = ''
      return
    }
    if (article.encrypted === 1 || isEncryptedPayload(article.content)) {
      const pw = passwordCache.get(article.id)
      if (pw && unlockedIds.value.includes(article.id)) {
        try {
          currentContent.value = await decryptText(pw, article.content)
        } catch {
          // 密码缓存异常（理论上不会发生），回退锁定态
          unlockedIds.value = unlockedIds.value.filter((x) => x !== article.id)
          passwordCache.delete(article.id)
          currentContent.value = ''
        }
      } else {
        currentContent.value = ''
      }
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
        rebuildAllLinks()
        return
      }
      // 权限未授予（无手势）：保留句柄，给用户"重新连接"入口
      pendingWorkspace.value = { name: record.directoryName, handle: record.directoryHandle }
    }
    // 回退：纯 IndexedDB 模式
    await loadArticles()
    rebuildAllLinks()
  }

  /** 用户手势内重新连接上次的工作目录 */
  const reconnectWorkspace = async (): Promise<boolean> => {
    const pw = pendingWorkspace.value
    if (!pw) return false
    const ws = await fsService.restoreWorkspace(pw.handle)
    if (!ws) {
      // 用户拒绝授权：清掉记录，不再打扰
      pendingWorkspace.value = null
      await db.workspaces.delete('default')
      return false
    }
    pendingWorkspace.value = null
    isFsMode.value = true
    workspaceName.value = ws.directoryName
    await syncFsArticles()
    rebuildAllLinks()
    return true
  }

  /** 忽略未连接的工作目录提示 */
  const dismissPendingWorkspace = async () => {
    pendingWorkspace.value = null
    await db.workspaces.delete('default')
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
    pendingWorkspace.value = null
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
    const art = articles.value.find((a) => a.id === currentArticleId.value)
    if (!art) return

    // 加密笔记：落库前用缓存密码重新加密，双链解析仍用明文
    let plainContent: string | undefined
    if (changes.content !== undefined && (art.encrypted === 1 || isEncryptedPayload(art.content))) {
      const pw = passwordCache.get(art.id)
      if (!pw) return // 锁定态不应触发保存
      plainContent = changes.content
      changes = { ...changes, content: await encryptText(pw, changes.content) }
    }

    await articleDB.updateArticle(currentArticleId.value, changes)

    // 文件系统模式：写回文件
    if (isFsMode.value && changes.content !== undefined) {
      if (art?.filePath) {
        const handle = fileHandles.get(currentArticleId.value)
        if (handle) {
          await fsService.writeFile(handle, changes.content)
        }
      }
    }

    // 文件系统模式下处理标题变更 → 重命名文件
    if (isFsMode.value && changes.title !== undefined) {
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

    // 双链索引同步（加密笔记用明文解析）
    const finalContent = plainContent ?? changes.content
    if (finalContent !== undefined) {
      const changed = await syncLinksForArticle(art.id, finalContent)
      if (changed) linkVersion.value++
    }
    // 标题落定：回填此前指向该标题但目标尚不存在的空链接
    if (changes.title !== undefined) {
      const resolved = await resolveLinksForTitle(changes.title)
      if (resolved) linkVersion.value++
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

  // ── 自动快照（每 5 分钟，加密笔记跳过以防明文泄露） ──
  let snapshotTimer: ReturnType<typeof setInterval> | null = null

  function startAutoSnapshot() {
    if (snapshotTimer) return
    snapshotTimer = setInterval(() => {
      const art = currentArticle.value
      if (art && art.encrypted !== 1 && currentContent.value.trim()) {
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
    // 彻底清理：明文快照与图片资产一并删除，避免"永久删除"名不副实
    await deleteAllSnapshots(id)
    await deleteAssetsForArticle(id)
    await loadTrash()
  }

  function toggleTrash() {
    showTrash.value = !showTrash.value
    if (showTrash.value) loadTrash()
  }

  // ── 双链 ──
  /** 版本号：Links 表变化时自增，驱动反链/图谱刷新 */
  const linkVersion = ref(0)
  /** 当前文章的反向链接（来源文章列表） */
  const backlinks = ref<{ id: string; title: string }[]>([])

  async function refreshBacklinks() {
    const id = currentArticleId.value
    if (!id) {
      backlinks.value = []
      return
    }
    const links = await getBacklinks(id)
    const out: { id: string; title: string }[] = []
    for (const l of links) {
      const src = articles.value.find((a) => a.id === l.sourceId && a.isDeleted === 0)
      if (src) out.push({ id: src.id, title: src.title })
    }
    backlinks.value = out
  }

  watch([currentArticleId, linkVersion], refreshBacklinks)

  /** 启动时后台重建全量双链索引（不阻塞界面） */
  async function rebuildAllLinks() {
    for (const a of articles.value) {
      if (a.isDeleted !== 0 || a.encrypted === 1 || isEncryptedPayload(a.content)) continue
      const changed = await syncLinksForArticle(a.id, a.content)
      if (changed) linkVersion.value++
    }
  }

  /** 按标题打开笔记；不存在则以该标题新建（Obsidian 风格） */
  const openByTitle = async (title: string) => {
    const found = articles.value.find((a) => a.isDeleted === 0 && a.title === title)
    if (found) {
      selectArticle(found.id)
      return
    }
    await createArticle()
    await updateCurrentArticle({ title })
  }

  // ── 加密操作 ──

  /** 给当前笔记设置密码并加密（内容仍在本次会话保持解锁可编辑） */
  const encryptCurrent = async (password: string): Promise<boolean> => {
    const art = currentArticle.value
    if (!art || art.encrypted === 1) return false
    const cipher = await encryptText(password, currentContent.value)

    await articleDB.updateArticle(art.id, { content: cipher, encrypted: 1 })
    const idx = articles.value.findIndex((a) => a.id === art.id)
    if (idx !== -1) {
      articles.value[idx] = { ...articles.value[idx], content: cipher, encrypted: 1, updatedAt: Date.now() }
      searchUpdate({ ...articles.value[idx] })
    }
    // FS 模式：密文同步写回文件
    if (isFsMode.value && art.filePath) {
      const handle = fileHandles.get(art.id)
      if (handle) await fsService.writeFile(handle, cipher)
    }
    // 加密前产生的明文快照一并清除
    await deleteAllSnapshots(art.id)

    passwordCache.set(art.id, password)
    if (!unlockedIds.value.includes(art.id)) unlockedIds.value.push(art.id)
    return true
  }

  /** 解锁当前笔记 */
  const unlockCurrent = async (password: string): Promise<boolean> => {
    const art = currentArticle.value
    if (!art) return false
    try {
      const plain = await decryptText(password, art.content)
      unlockedIds.value.push(art.id)
      passwordCache.set(art.id, password)
      currentContent.value = plain
      return true
    } catch {
      return false
    }
  }

  /** 重新锁定（清除内存明文与密码缓存） */
  const lockCurrent = () => {
    const id = currentArticleId.value
    if (!id) return
    unlockedIds.value = unlockedIds.value.filter((x) => x !== id)
    passwordCache.delete(id)
    currentContent.value = ''
  }

  // ── DB 模式导入 ──
  /** 未打开工作目录时，把外部 .md 文本导入 IndexedDB */
  const importArticleFromDb = async (fileName: string, content: string) => {
    const base = fileName.replace(/\.md$/i, '')
    const existingNames = new Set(articles.value.map((a) => a.title))
    let title = base
    let counter = 1
    while (existingNames.has(title)) {
      title = `${base} (${counter++})`
    }

    const id = await articleDB.createArticle({
      title,
      content,
      folderId: null,
      tags: [],
      filePath: null,
    })
    await loadArticles()
    const art = articles.value.find((a) => a.id === id)
    if (art) searchUpdate(art)
    const changed = await syncLinksForArticle(id, content)
    if (changed) linkVersion.value++
    currentArticleId.value = id
    currentContent.value = content
    return id
  }

  /** WebDAV 等外部同步后：重载数据并重建搜索索引与双链 */
  const refreshAfterExternalSync = async () => {
    await loadArticles()
    buildIndex(articles.value)
    rebuildAllLinks()
    // 当前打开的文章内容可能已被远端更新
    const art = currentArticle.value
    if (art && !currentLocked.value) {
      if (art.encrypted !== 1 && !isEncryptedPayload(art.content)) {
        currentContent.value = art.content
      }
    }
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
    pendingWorkspace,
    initWorkspace,
    reconnectWorkspace,
    dismissPendingWorkspace,
    openFolder,
    closeWorkspace,
    importMarkdownFile,
    importArticleFromDb,
    loadArticles,
    createArticle,
    updateCurrentArticle,
    selectArticle,
    deleteCurrentArticle,
    // 加密
    currentEncrypted,
    currentLocked,
    encryptCurrent,
    unlockCurrent,
    lockCurrent,
    // 双链
    linkVersion,
    backlinks,
    openByTitle,
    // 外部同步
    refreshAfterExternalSync,
  }
})

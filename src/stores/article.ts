import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Article, Folder } from '@/types/article'
import * as articleDB from '@/services/db/article'
import { db } from '@/services/db'
import * as fsService from '@/services/fs'
import { updateDoc as searchUpdate, removeDoc as searchRemove } from '@/services/search'
import { createSnapshot, deleteAllSnapshots } from '@/services/snapshot'
import { deleteAssetsForArticle } from '@/services/assets'
import { countWords } from '@/utils/wordCount'
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
    purgeExpiredTrash() // 后台清理过期回收站，不阻塞启动
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
    touchActivity()
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
    folders.value = await db.folders.toArray()
  }

  // ── 文件夹 ──
  const folders = ref<Folder[]>([])

  function generateId(): string {
    return crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15)
  }

  async function loadFolders() {
    folders.value = await db.folders.toArray()
  }

  /** 新建文件夹（可指定父文件夹） */
  const createFolder = async (name: string, parentId: string | null = null) => {
    const trimmed = name.trim()
    if (!trimmed) return null
    const maxOrder = folders.value
      .filter((f) => (f.parentId ?? null) === parentId)
      .reduce((m, f) => Math.max(m, f.sortOrder), 0)
    const folder: Folder = {
      id: generateId(),
      name: trimmed,
      parentId,
      sortOrder: maxOrder + 1,
      createdAt: Date.now(),
    }
    await db.folders.put(folder)
    await loadFolders()
    broadcastChange()
    return folder
  }

  async function renameFolder(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    await db.folders.update(id, { name: trimmed })
    await loadFolders()
    broadcastChange()
  }

  /** 删除文件夹：其中的子文件夹与笔记上移一层（不丢数据） */
  async function deleteFolder(id: string) {
    const folder = folders.value.find((f) => f.id === id)
    if (!folder) return
    const parentId = folder.parentId ?? null
    await db.transaction('rw', [db.folders, db.articles], async () => {
      const children = folders.value.filter((f) => f.parentId === id)
      for (const child of children) {
        await db.folders.update(child.id, { parentId })
      }
      const inside = articles.value.filter((a) => a.folderId === id)
      for (const a of inside) {
        await db.articles.update(a.id, { folderId: parentId })
      }
      await db.folders.delete(id)
    })
    await Promise.all([loadFolders(), loadArticles()])
    broadcastChange()
  }

  /** 把笔记移动到文件夹（null = 根目录；不刷新 updatedAt，避免污染同步时间判断） */
  async function moveArticleToFolder(articleId: string, folderId: string | null) {
    const art = articles.value.find((a) => a.id === articleId)
    if (!art || (art.folderId ?? null) === folderId) return
    await db.articles.update(articleId, { folderId })
    const idx = articles.value.findIndex((a) => a.id === articleId)
    if (idx !== -1) articles.value[idx] = { ...articles.value[idx], folderId }
    broadcastChange()
  }

  // ── 标签 ──
  /** 当前标签筛选（null = 全部） */
  const tagFilter = ref<string | null>(null)

  /** 应用筛选后的文章列表（供侧栏树渲染） */
  const visibleArticles = computed(() =>
    tagFilter.value
      ? articles.value.filter((a) => a.isDeleted === 0 && a.tags?.includes(tagFilter.value!))
      : articles.value
  )

  /** 全部标签及计数（未删除笔记） */
  const allTags = computed(() => {
    const counts = new Map<string, number>()
    for (const a of articles.value) {
      if (a.isDeleted !== 0) continue
      for (const t of a.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name))
  })

  async function addTag(articleId: string, tag: string) {
    const trimmed = tag.trim()
    if (!trimmed) return
    const art = articles.value.find((a) => a.id === articleId)
    if (!art || art.tags?.includes(trimmed)) return
    const tags = [...(art.tags ?? []), trimmed]
    await articleDB.updateArticle(articleId, { tags })
    const idx = articles.value.findIndex((a) => a.id === articleId)
    if (idx !== -1) articles.value[idx] = { ...articles.value[idx], tags }
  }

  async function removeTag(articleId: string, tag: string) {
    const art = articles.value.find((a) => a.id === articleId)
    if (!art) return
    const tags = (art.tags ?? []).filter((t) => t !== tag)
    await articleDB.updateArticle(articleId, { tags })
    const idx = articles.value.findIndex((a) => a.id === articleId)
    if (idx !== -1) articles.value[idx] = { ...articles.value[idx], tags }
    // 正在筛选的标签被删光时自动取消筛选
    if (tagFilter.value === tag && !articles.value.some((a) => a.tags?.includes(tag))) {
      tagFilter.value = null
    }
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
    touchActivity()

    // 加密笔记：落库前用缓存密码重新加密，双链解析仍用明文
    let plainContent: string | undefined
    if (changes.content !== undefined && (art.encrypted === 1 || isEncryptedPayload(art.content))) {
      const pw = passwordCache.get(art.id)
      if (!pw) return // 锁定态不应触发保存
      plainContent = changes.content
      changes = { ...changes, content: await encryptText(pw, changes.content) }
    }
    // 字数统计随内容更新
    const finalPlainForCount = plainContent ?? changes.content
    if (finalPlainForCount !== undefined) {
      changes = { ...changes, wordCount: countWords(finalPlainForCount) }
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
    broadcastChange()
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
    broadcastChange()
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
    broadcastChange()
  }

  async function permanentlyDeleteArticle(id: string) {
    await hardDeleteArticle(id)
    await loadTrash()
  }

  /** 彻底删除：文章 + 快照 + 图片资产一并清理 */
  async function hardDeleteArticle(id: string) {
    await db.articles.delete(id)
    searchRemove(id)
    await deleteAllSnapshots(id)
    await deleteAssetsForArticle(id)
  }

  // ── 回收站 30 天自动清理（软删除时间以 updatedAt 为准） ──
  const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

  async function purgeExpiredTrash() {
    const cutoff = Date.now() - TRASH_RETENTION_MS
    const expired = await db.articles
      .where('isDeleted')
      .equals(1)
      .filter((a) => a.updatedAt < cutoff)
      .toArray()
    if (expired.length === 0) return
    for (const a of expired) {
      await hardDeleteArticle(a.id)
    }
    if (showTrash.value) await loadTrash()
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
      touchActivity()
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

  // ── 自动重锁：15 分钟无编辑/切换操作，自动锁上全部已解锁的加密笔记 ──
  const AUTO_RELOCK_MS = 15 * 60 * 1000
  const lastActivityAt = ref(Date.now())

  function touchActivity() {
    lastActivityAt.value = Date.now()
  }

  /** 检查空闲并执行自动重锁（定时器与页面回前台时触发；暴露以便测试） */
  function relockIfIdle() {
    if (unlockedIds.value.length === 0) return
    if (Date.now() - lastActivityAt.value < AUTO_RELOCK_MS) return
    unlockedIds.value = []
    passwordCache.clear()
    if (currentEncrypted.value) currentContent.value = ''
  }

  setInterval(relockIfIdle, 60 * 1000)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) relockIfIdle()
    })
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
    broadcastChange()
    return id
  }

  /** WebDAV 等外部同步后：重载数据并重建搜索索引与双链 */
  const refreshAfterExternalSync = async () => {
    await reloadMeta()
    // 当前打开的文章内容可能已被远端更新
    const art = currentArticle.value
    if (art && !currentLocked.value) {
      if (art.encrypted !== 1 && !isEncryptedPayload(art.content)) {
        currentContent.value = art.content
      }
    }
  }

  /** 仅重载列表/搜索索引/双链（不动当前正在编辑的内容） */
  const reloadMeta = async () => {
    await loadArticles()
    buildIndex(articles.value)
    rebuildAllLinks()
  }

  // ── 备份提醒：浏览器存储模式下，超过 7 天未备份则启动时提醒一次 ──
  const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
  const REMIND_ONCE_MS = 24 * 60 * 60 * 1000
  const backupReminderVisible = ref(false)

  function checkBackupReminder() {
    // 文件夹模式数据已是磁盘文件，不依赖浏览器存储
    if (isFsMode.value) return
    if (visibleArticles.value.length === 0) return // 空库不提醒
    const now = Date.now()
    const lastBackup = Number(localStorage.getItem('moyu.lastBackupAt') || 0)
    const lastRemind = Number(localStorage.getItem('moyu.backupRemindAt') || 0)
    if (now - lastBackup < BACKUP_INTERVAL_MS) return
    if (now - lastRemind < REMIND_ONCE_MS) return // 每天最多提醒一次
    backupReminderVisible.value = true
  }

  /** 完成一次全量备份（导出 zip / WebDAV 同步成功） */
  function markBackedUp() {
    localStorage.setItem('moyu.lastBackupAt', String(Date.now()))
    backupReminderVisible.value = false
  }

  /** 用户选择暂不备份：当天不再提醒 */
  function dismissBackupReminder() {
    localStorage.setItem('moyu.backupRemindAt', String(Date.now()))
    backupReminderVisible.value = false
  }

  // ── 多标签页并发同步：本页变更广播给其他页，其他页重载元数据 ──
  const TAB_ID = Math.random().toString(36).slice(2)
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel('moyu-notes-sync')
    channel.onmessage = (e) => {
      if (e.data?.from === TAB_ID || e.data?.type !== 'articles-changed') return
      reloadMeta()
    }
  } catch {
    channel = null // 浏览器不支持时静默降级
  }

  /** 通知其他标签页：文章数据有变化 */
  function broadcastChange() {
    channel?.postMessage({ type: 'articles-changed', from: TAB_ID })
  }

  /** 清空全部本地数据（数据库 + 同步配置），用于测试数据复位或彻底重置 */
  const wipeAllData = async () => {
    stopAutoSnapshot()
    channel?.close()
    channel = null
    await db.delete()
    localStorage.clear()
    location.reload()
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
    // 自动重锁
    lastActivityAt,
    relockIfIdle,
    // 双链
    linkVersion,
    backlinks,
    openByTitle,
    // 外部同步
    refreshAfterExternalSync,
    // 文件夹 / 标签
    folders,
    loadFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    moveArticleToFolder,
    tagFilter,
    visibleArticles,
    allTags,
    addTag,
    removeTag,
    // 备份提醒
    backupReminderVisible,
    checkBackupReminder,
    markBackedUp,
    dismissBackupReminder,
    // 危险区
    wipeAllData,
  }
})

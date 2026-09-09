<template>
  <div class="file-tree">
    <div class="tree-header">
      <span class="tree-title">笔记</span>
      <span v-if="articles.length > 0" class="tree-count">{{ articles.length }}</span>
      <div class="tree-actions">
        <button
          class="tree-btn"
          :class="{ active: !!tagFilter }"
          title="按标签筛选"
          @click="showTagPanel = !showTagPanel"
        >
          <n-icon size="15"><pricetags-outline /></n-icon>
        </button>
        <button v-if="showImport" class="tree-btn" @click="onImport" title="导入 .md 文件">
          <n-icon size="15"><cloud-upload-outline /></n-icon>
        </button>
        <button class="tree-btn" @click="startCreateFolder" title="新建文件夹">
          <n-icon size="15"><folder-open-outline /></n-icon>
        </button>
        <button class="tree-btn" @click="onCreate" title="新建笔记">
          <n-icon size="15"><add-outline /></n-icon>
        </button>
      </div>
    </div>

    <!-- 标签筛选面板 -->
    <div v-if="showTagPanel" class="tag-panel">
      <button
        class="tag-row"
        :class="{ active: !tagFilter }"
        @click="setTagFilter(null)"
      >
        全部笔记
      </button>
      <button
        v-for="t in store.allTags"
        :key="t.name"
        class="tag-row"
        :class="{ active: tagFilter === t.name }"
        @click="setTagFilter(tagFilter === t.name ? null : t.name)"
      >
        <span class="tag-name"># {{ t.name }}</span>
        <span class="tag-count">{{ t.count }}</span>
      </button>
      <div v-if="store.allTags.length === 0" class="tag-empty">还没有标签，在编辑器里给笔记添加</div>
    </div>

    <!-- 新建文件夹行内输入 -->
    <div v-if="creatingFolder" class="folder-input-row">
      <n-icon size="14" class="row-icon"><folder-outline /></n-icon>
      <input
        ref="newFolderInputRef"
        v-model="newFolderName"
        class="row-input"
        placeholder="文件夹名称，回车确认"
        @keydown.enter="confirmCreateFolder"
        @keydown.escape="creatingFolder = false"
        @blur="confirmCreateFolder"
      />
    </div>

    <div ref="scrollRef" class="tree-scroll">
      <div class="tree-spacer" :style="{ height: totalHeight + 'px' }">
        <div class="tree-window" :style="{ transform: `translateY(${offsetY}px)` }">
          <template v-for="row in visibleItems" :key="row.type + '-' + row.id">
            <!-- 文件夹行 / 重命名输入 -->
            <div
              v-if="row.type === 'folder' && renamingId !== row.id"
              class="tree-item folder-item"
              :style="{ height: ITEM_HEIGHT + 'px', paddingLeft: row.depth * 14 + 8 + 'px' }"
              @click="toggleFolder(row.id)"
            >
              <n-icon size="12" class="chevron" :class="{ open: !isCollapsed(row.id) }">
                <chevron-forward-outline />
              </n-icon>
              <n-icon size="14" class="row-icon"><folder-outline /></n-icon>
              <span class="item-title">{{ row.folder!.name }}</span>
              <span class="folder-count">{{ folderCounts.get(row.id) ?? 0 }}</span>
              <span class="row-actions" @click.stop>
                <button class="mini-btn" title="重命名" @click="startRename(row.id)">
                  <n-icon size="13"><create-outline /></n-icon>
                </button>
                <button class="mini-btn danger" title="删除文件夹（内容上移一层）" @click="onDeleteFolder(row.id)">
                  <n-icon size="13"><trash-outline /></n-icon>
                </button>
              </span>
            </div>
            <div
              v-else-if="row.type === 'folder' && renamingId === row.id"
              class="folder-input-row"
              :style="{ marginLeft: row.depth * 14 + 'px' }"
            >
              <n-icon size="14" class="row-icon"><folder-outline /></n-icon>
              <input
                ref="renameInputRef"
                v-model="renameValue"
                class="row-input"
                @keydown.enter="confirmRename(row.id)"
                @keydown.escape="renamingId = null"
                @blur="confirmRename(row.id)"
              />
            </div>

            <!-- 笔记行 -->
            <div
              v-else-if="row.type === 'article'"
              class="tree-item article-item"
              :class="{ active: currentId === row.id }"
              :style="{ height: ITEM_HEIGHT + 'px', paddingLeft: row.depth * 14 + 8 + 'px' }"
              @click="onSelect(row.id)"
            >
              <n-icon size="14" class="row-icon">
                <document-text-outline />
              </n-icon>
              <span class="item-title">{{ row.article!.title || '未命名' }}</span>
              <span class="row-actions" @click.stop>
                <button class="mini-btn" title="移动到文件夹…" @click="openMoveMenu(row.id, $event)">
                  <n-icon size="13"><folder-open-outline /></n-icon>
                </button>
              </span>
            </div>
          </template>
        </div>
      </div>
      <div v-if="articles.length === 0 && !creatingFolder" class="tree-empty">
        {{ tagFilter ? `没有带「#${tagFilter}」标签的笔记` : showImport ? '暂无笔记，点击 + 新建 或导入' : '暂无笔记，点击 + 新建' }}
      </div>
    </div>

    <!-- 移动到文件夹菜单 -->
    <teleport to="body">
      <div v-if="moveMenuArticleId" class="move-overlay" @click="moveMenuArticleId = null">
        <div class="move-menu" :style="moveMenuStyle" @click.stop>
          <div class="move-header">移动到…</div>
          <button class="move-item" :class="{ current: moveCurrentFolder === null }" @click="doMove(null)">
            <n-icon size="14"><documents-outline /></n-icon>
            根目录（不分组）
          </button>
          <button
            v-for="f in flatFolders"
            :key="f.id"
            class="move-item"
            :class="{ current: moveCurrentFolder === f.id }"
            :style="{ paddingLeft: f.depth * 14 + 10 + 'px' }"
            :disabled="moveCurrentFolder === f.id"
            @click="doMove(f.id)"
          >
            <n-icon size="14"><folder-outline /></n-icon>
            {{ f.name }}
          </button>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { NIcon } from 'naive-ui'
import {
  AddOutline,
  DocumentTextOutline,
  CloudUploadOutline,
  FolderOutline,
  FolderOpenOutline,
  ChevronForwardOutline,
  CreateOutline,
  TrashOutline,
  PricetagsOutline,
  DocumentsOutline,
} from '@vicons/ionicons5'
import type { Article, Folder } from '@/types/article'
import { useVirtualList } from '@/composables/useVirtualList'
import { useArticleStore } from '@/stores/article'

/** 固定行高：虚拟滚动依赖精确高度 */
const ITEM_HEIGHT = 34

const props = withDefaults(defineProps<{
  articles: Article[]
  currentId: string | null
  showImport?: boolean
}>(), {
  showImport: false,
})

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'create'): void
  (e: 'import'): void
}>()

const store = useArticleStore()
/** 模板别名：当前标签筛选 */
const tagFilter = computed(() => store.tagFilter)

const onSelect = (id: string) => emit('select', id)
const onCreate = () => emit('create')
const onImport = () => emit('import')

// ── 折叠状态（持久化） ──
const collapsed = ref<string[]>(
  localStorage.getItem('moyu.collapsed-folders')?.split(',').filter(Boolean) ?? []
)
watch(collapsed, (v) => localStorage.setItem('moyu.collapsed-folders', v.join(',')), { deep: true })

function isCollapsed(id: string) {
  return collapsed.value.includes(id)
}
function toggleFolder(id: string) {
  collapsed.value = isCollapsed(id)
    ? collapsed.value.filter((x) => x !== id)
    : [...collapsed.value, id]
}

// ── 树扁平化：按展开状态生成虚拟滚动行 ──
interface TreeRow {
  type: 'folder' | 'article'
  id: string
  depth: number
  folder?: Folder
  article?: Article
}

const treeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = []
  const childrenOf = (parentId: string | null) =>
    store.folders
      .filter((f) => (f.parentId ?? null) === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh'))
  const walk = (parentId: string | null, depth: number) => {
    for (const f of childrenOf(parentId)) {
      rows.push({ type: 'folder', id: f.id, depth, folder: f })
      if (!isCollapsed(f.id)) walk(f.id, depth + 1)
    }
    const arts = props.articles
      .filter((a) => (a.folderId ?? null) === parentId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    for (const a of arts) rows.push({ type: 'article', id: a.id, depth, article: a })
  }
  walk(null, 0)
  return rows
})

/** 文件夹内条目计数（含子文件夹内，用于文件夹行徽标） */
const folderCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const a of props.articles) {
    let pid = a.folderId ?? null
    while (pid) {
      counts.set(pid, (counts.get(pid) ?? 0) + 1)
      pid = store.folders.find((f) => f.id === pid)?.parentId ?? null
    }
  }
  return counts
})

/** 弹出菜单用的扁平文件夹列表（DFS 带深度） */
const flatFolders = computed(() => {
  const out: { id: string; name: string; depth: number }[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const f of store.folders
      .filter((x) => (x.parentId ?? null) === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)) {
      out.push({ id: f.id, name: f.name, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

const scrollRef = ref<HTMLElement | null>(null)
const { visibleItems, offsetY, totalHeight } = useVirtualList(
  scrollRef,
  treeRows,
  ITEM_HEIGHT
)

// ── 新建文件夹 ──
const creatingFolder = ref(false)
const newFolderName = ref('')
const newFolderInputRef = ref<HTMLInputElement>()

async function startCreateFolder() {
  creatingFolder.value = true
  newFolderName.value = ''
  await nextTick()
  newFolderInputRef.value?.focus()
}

async function confirmCreateFolder() {
  if (!creatingFolder.value) return
  const name = newFolderName.value.trim()
  creatingFolder.value = false
  if (name) await store.createFolder(name, null)
}

// ── 重命名 ──
const renamingId = ref<string | null>(null)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement>()

async function startRename(id: string) {
  const folder = store.folders.find((f) => f.id === id)
  renamingId.value = id
  renameValue.value = folder?.name ?? ''
  await nextTick()
  renameInputRef.value?.focus()
}

async function confirmRename(id: string) {
  if (renamingId.value !== id) return
  const value = renameValue.value
  renamingId.value = null
  if (value.trim()) await store.renameFolder(id, value)
}

async function onDeleteFolder(id: string) {
  const folder = store.folders.find((f) => f.id === id)
  if (!folder) return
  if (confirm(`删除文件夹「${folder.name}」？\n其中的笔记与子文件夹会上移一层，不会丢失。`)) {
    await store.deleteFolder(id)
  }
}

// ── 移动到文件夹 ──
const moveMenuArticleId = ref<string | null>(null)
const moveMenuStyle = ref<{ left: string; top: string }>()

const moveCurrentFolder = computed(
  () => props.articles.find((a) => a.id === moveMenuArticleId.value)?.folderId ?? null
)

function openMoveMenu(articleId: string, event?: MouseEvent) {
  moveMenuArticleId.value = articleId
  // 简单定位：菜单出现在点击点附近（不出屏幕右缘）
  const x = Math.min(event?.clientX ?? 200, window.innerWidth - 240)
  const y = Math.min(event?.clientY ?? 200, window.innerHeight - 320)
  moveMenuStyle.value = { left: x + 'px', top: y + 'px' }
}

async function doMove(folderId: string | null) {
  if (moveMenuArticleId.value) {
    await store.moveArticleToFolder(moveMenuArticleId.value, folderId)
  }
  moveMenuArticleId.value = null
}

// ── 标签筛选 ──
const showTagPanel = ref(false)
function setTagFilter(tag: string | null) {
  store.tagFilter = tag
  if (tag) showTagPanel.value = false
}
</script>

<style scoped lang="scss">
.file-tree {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 6px;
  position: relative;
}

.tree-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  margin-bottom: 2px;
  flex-shrink: 0;
}

.tree-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.tree-count {
  font-size: 10px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 8px;
}

.tree-actions {
  display: flex;
  gap: 2px;
  margin-left: auto;
}

.tree-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s;

  &:hover {
    background: var(--bg-hover);
    color: var(--accent-color);
  }

  &.active {
    background: var(--accent-soft);
    color: var(--accent-color);
  }
}

// ── 标签筛选面板 ──
.tag-panel {
  flex-shrink: 0;
  max-height: 180px;
  overflow: auto;
  margin-bottom: 4px;
  padding: 4px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tag-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    background: var(--accent-soft);
    color: var(--accent-color);
    font-weight: 600;
  }
}

.tag-count {
  font-size: 10px;
  opacity: 0.75;
}

.tag-empty {
  padding: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
  text-align: center;
}

// ── 行内输入（新建/重命名文件夹） ──
.folder-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 8px;
}

.row-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.row-input {
  flex: 1;
  min-width: 0;
  background: var(--bg-tertiary);
  border: 1px solid var(--accent-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 12px;
  padding: 4px 8px;
  outline: none;

  &::placeholder {
    color: var(--text-tertiary);
  }
}

// ── 列表行 ──
.tree-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
}

.tree-spacer {
  position: relative;
}

.tree-window {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  will-change: transform;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 6px;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  transition: background 0.12s, color 0.12s;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);

    .row-actions {
      opacity: 1;
    }
  }
}

.folder-item {
  color: var(--text-primary);
  font-weight: 500;

  .chevron {
    color: var(--text-tertiary);
    transition: transform 0.15s;

    &.open {
      transform: rotate(90deg);
    }
  }

  .folder-count {
    margin-left: auto;
    font-size: 10px;
    color: var(--text-tertiary);
    font-weight: 400;
  }

  &:hover .folder-count {
    display: none;
  }
}

.article-item {
  &.active {
    background: var(--accent-soft);
    color: var(--accent-color);
    font-weight: 500;
  }
}

.item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.row-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s;
  flex-shrink: 0;
}

.mini-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  display: flex;
  align-items: center;

  &:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  &.danger:hover {
    color: var(--danger-color);
  }
}

.tree-empty {
  padding: 24px 8px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}

// ── 移动菜单 ──
.move-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
}

.move-menu {
  position: fixed;
  width: 220px;
  max-height: 320px;
  overflow: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  padding: 6px;
  z-index: 91;
}

.move-header {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 6px 10px 8px;
}

.move-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 7px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;

  &:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.current {
    color: var(--text-tertiary);
    cursor: default;
    font-weight: 600;
  }
}
</style>

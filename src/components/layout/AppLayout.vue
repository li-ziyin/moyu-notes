<template>
  <div
    class="app-shell"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- ── 顶栏 ── -->
    <header class="topbar">
      <div class="topbar-left">
        <button
          class="icon-btn"
          :class="{ active: !ui.sidebarCollapsed }"
          :title="ui.sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          @click="ui.toggleSidebar"
        >
          <n-icon size="18"><menu-outline /></n-icon>
        </button>
        <div class="brand">
          <span class="brand-mark">墨</span>
          <span class="brand-name">墨语笔记</span>
        </div>
      </div>
      <div class="topbar-right">
        <button class="icon-btn" title="搜索笔记 (Ctrl+P)" @click="openSearch">
          <n-icon size="17"><search-outline /></n-icon>
        </button>
        <button
          class="icon-btn"
          :class="{ active: ui.outlineVisible }"
          title="大纲 / 反向链接"
          @click="ui.toggleOutline"
        >
          <n-icon size="17"><list-outline /></n-icon>
        </button>
        <button class="icon-btn" title="知识图谱" @click="graphVisible = true">
          <n-icon size="17"><git-network-outline /></n-icon>
        </button>
        <button
          class="icon-btn"
          :class="{ active: isMobile ? mobilePreview : ui.previewVisible }"
          :title="ui.previewVisible ? '收起预览分栏' : '展开预览分栏'"
          @click="togglePreview"
        >
          <n-icon size="17"><grid-outline /></n-icon>
        </button>
        <button
          class="icon-btn"
          :class="{ active: isFullscreen }"
          :title="isFullscreen ? '退出全屏（Esc）' : '进入全屏'"
          @click="toggleFullscreen"
        >
          <n-icon size="17">
            <contract-outline v-if="isFullscreen" />
            <scan-outline v-else />
          </n-icon>
        </button>
        <button
          class="icon-btn"
          :title="theme === 'light' ? '切换暗色主题' : '切换亮色主题'"
          @click="toggleTheme"
        >
          <n-icon size="17">
            <moon-outline v-if="theme === 'light'" />
            <sunny-outline v-else />
          </n-icon>
        </button>
      </div>
    </header>

    <!-- ── 工作区卡片 ── -->
    <div class="workspace">
      <aside class="sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
        <div class="sidebar-inner">
          <SideBar />
        </div>
      </aside>

      <main class="main-area">
        <EditorArea />
      </main>

      <aside ref="previewColRef" class="preview" :class="{ collapsed: effectivePreviewHidden }">
        <PreviewArea />
      </aside>

      <!-- 移动端：侧栏展开时的遮罩 -->
      <transition name="fade">
        <div
          v-if="isMobile && !ui.sidebarCollapsed"
          class="mobile-backdrop"
          @click="ui.toggleSidebar"
        />
      </transition>

      <!-- ── 大纲 / 反链抽屉（悬浮于工作区右侧） ── -->
      <transition name="drawer">
        <div v-if="ui.outlineVisible" class="outline-drawer">
          <div class="outline-header">
            <div class="drawer-tabs">
              <button
                class="drawer-tab"
                :class="{ active: drawerTab === 'outline' }"
                @click="drawerTab = 'outline'"
              >
                大纲
              </button>
              <button
                class="drawer-tab"
                :class="{ active: drawerTab === 'backlinks' }"
                @click="drawerTab = 'backlinks'"
              >
                反向链接
                <span v-if="articleStore.backlinks.length > 0" class="tab-badge">
                  {{ articleStore.backlinks.length }}
                </span>
              </button>
            </div>
            <button class="icon-btn sm" title="关闭" @click="ui.toggleOutline">
              <n-icon size="14"><close-outline /></n-icon>
            </button>
          </div>

          <!-- 大纲 -->
          <div v-if="drawerTab === 'outline'" class="outline-list">
            <template v-if="outlineItems.length > 0">
              <div
                v-for="(item, i) in outlineItems"
                :key="i"
                class="outline-item"
                :class="{ 'is-h1': item.level === 1, 'is-h2': item.level === 2 }"
                :style="{ paddingLeft: (item.level - 1) * 14 + 12 + 'px' }"
                @click="scrollToHeading(item)"
              >
                {{ item.text }}
              </div>
            </template>
            <div v-else class="outline-empty">暂无标题</div>
          </div>

          <!-- 反向链接 -->
          <div v-else class="outline-list">
            <template v-if="articleStore.backlinks.length > 0">
              <div
                v-for="b in articleStore.backlinks"
                :key="b.id"
                class="outline-item"
                @click="articleStore.selectArticle(b.id)"
              >
                {{ b.title || '未命名' }}
              </div>
            </template>
            <div v-else class="outline-empty">
              暂无反向链接<br />
              <span class="empty-sub">在其他笔记中用 [[本文标题]] 引用，就会出现在这里</span>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- ── 知识图谱 ── -->
    <GraphPanel v-model:visible="graphVisible" @open="onGraphOpen" />

    <!-- ── 备份提醒（右上角浮出） ── -->
    <BackupToast />

    <!-- ── 拖拽 .md 导入遮罩 ── -->
    <transition name="fade">
      <div v-if="dragDepth > 0" class="drop-overlay">
        <div class="drop-card">
          <n-icon size="28"><cloud-upload-outline /></n-icon>
          <div class="drop-text">松开鼠标，导入 .md 笔记</div>
        </div>
      </div>
    </transition>

    <SearchPanel ref="searchPanelRef" @select="onSearchSelect" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { NIcon } from 'naive-ui'
import {
  MenuOutline,
  SearchOutline,
  ListOutline,
  GridOutline,
  MoonOutline,
  SunnyOutline,
  CloseOutline,
  GitNetworkOutline,
  ScanOutline,
  ContractOutline,
  CloudUploadOutline,
} from '@vicons/ionicons5'
import SideBar from '@/components/sidebar/SideBar.vue'
import EditorArea from '@/components/editor/EditorArea.vue'
import PreviewArea from '@/components/preview/PreviewArea.vue'
import SearchPanel from '@/components/search/SearchPanel.vue'
import GraphPanel from '@/components/graph/GraphPanel.vue'
import BackupToast from '@/components/common/BackupToast.vue'
import { useArticleStore } from '@/stores/article'
import { useSettingStore } from '@/stores/setting'
import { storeToRefs } from 'pinia'
import { buildIndex } from '@/services/search'
import { parseOutline, type OutlineItem } from '@/composables/useOutline'

const articleStore = useArticleStore()
const ui = useSettingStore()
const { theme } = storeToRefs(ui)
const { toggleTheme } = ui

const searchPanelRef = ref<InstanceType<typeof SearchPanel>>()
const previewColRef = ref<HTMLElement>()
const graphVisible = ref(false)
const drawerTab = ref<'outline' | 'backlinks'>('outline')

// ── 移动端适配 ──
const isMobile = ref(window.matchMedia('(max-width: 768px)').matches)

function onMediaChange(e: MediaQueryListEvent) {
  isMobile.value = e.matches
}
const mobileQuery = window.matchMedia('(max-width: 768px)')
mobileQuery.addEventListener('change', onMediaChange)
onBeforeUnmount(() => mobileQuery.removeEventListener('change', onMediaChange))

/** 移动端预览默认隐藏（独立开关，不污染桌面端持久化状态） */
const mobilePreview = ref(false)

/** 移动端预览默认隐藏；桌面端跟随持久化状态 */
const effectivePreviewHidden = computed(() =>
  isMobile.value ? !mobilePreview.value : !ui.previewVisible
)

function togglePreview() {
  if (isMobile.value) {
    mobilePreview.value = !mobilePreview.value
  } else {
    ui.togglePreview()
  }
}

// ── 全屏：写作禅模式（全屏 + 双栏折叠） ──
const isFullscreen = ref(!!document.fullscreenElement)

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

async function toggleFullscreen() {
  const doc = document as any
  const el = document.documentElement as any
  try {
    if (doc.fullscreenElement) {
      await (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.())
    } else {
      const request = el.requestFullscreen || el.webkitRequestFullscreen
      if (request) await request.call(el)
    }
  } catch {
    // 用户拒绝授权或当前环境不支持全屏
  }
}

document.addEventListener('fullscreenchange', onFullscreenChange)
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

const outlineItems = computed<OutlineItem[]>(() => parseOutline(articleStore.currentContent))

function openSearch() {
  searchPanelRef.value?.open()
}

function onSearchSelect(id: string) {
  articleStore.selectArticle(id)
}

function onGraphOpen(id: string) {
  articleStore.selectArticle(id)
}

/** 点击大纲：若预览分栏收起则先展开，再滚动到对应标题 */
async function scrollToHeading(item: OutlineItem) {
  if (!ui.previewVisible) ui.togglePreview()
  await nextTick()
  const headings = previewColRef.value?.querySelectorAll(`h${item.level}`)
  if (!headings) return
  for (const h of headings) {
    if (h.textContent?.trim() === item.text) {
      h.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
  }
}

// ── 拖拽 .md 导入 ──
const dragDepth = ref(0)

function onDragEnter(e: DragEvent) {
  if (e.dataTransfer?.types.includes('Files')) dragDepth.value++
}
function onDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}
async function onDrop(e: DragEvent) {
  dragDepth.value = 0
  const files = [...(e.dataTransfer?.files ?? [])]
  if (files.length === 0) return
  const { imported } = await articleStore.importDroppedFiles(files)
  if (imported === 0) return
  buildIndex(articleStore.articles)
}

// Ctrl+P 打开搜索（全局监听）
function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault()
    openSearch()
  }
}

onMounted(async () => {
  await articleStore.initWorkspace()
  buildIndex(articleStore.articles)
  articleStore.checkBackupReminder() // 浏览器存储模式下检查是否需要备份提醒
  document.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<style scoped lang="scss">
.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-canvas);
  color: var(--text-primary);
  position: relative;
}

// ── 拖拽导入遮罩 ──
.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 80;
  background: var(--accent-soft);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 48px;
  border: 2px dashed var(--accent-color);
  border-radius: var(--radius-lg);
  background: var(--bg-primary);
  box-shadow: var(--shadow-pop);
  color: var(--accent-color);
}

.drop-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

// ── 顶栏 ──
.topbar {
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 8px;
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-left: 8px;
}

.brand-mark {
  width: 27px;
  height: 27px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent-color), var(--accent-hover));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  box-shadow: 0 2px 6px var(--accent-soft);
}

.brand-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    background: var(--accent-soft);
    color: var(--accent-color);
  }

  &.sm {
    width: 24px;
    height: 24px;
  }
}

// ── 工作区：浮起的圆角卡片 ──
.workspace {
  flex: 1;
  min-height: 0;
  margin: 0 12px 12px;
  display: flex;
  border-radius: var(--radius-lg);
  background: var(--bg-primary);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  position: relative;
}

// ── 侧边栏（可折叠） ──
.sidebar {
  width: 256px;
  flex-shrink: 0;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  overflow: hidden;
  transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.28s;

  &.collapsed {
    width: 0;
    border-right-color: transparent;
  }
}

.sidebar-inner {
  width: 256px;
  height: 100%;
}

// ── 主编辑区 ──
.main-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

// ── 预览分栏（可收起） ──
.preview {
  width: 46%;
  min-width: 0;
  flex-shrink: 0;
  background: var(--bg-primary);
  border-left: 1px solid var(--border-color);
  overflow: hidden;
  transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.28s;

  &.collapsed {
    width: 0;
    border-left-color: transparent;
  }
}

// ── 移动端遮罩 ──
.mobile-backdrop {
  position: absolute;
  inset: 0;
  z-index: 35;
  background: rgba(0, 0, 0, 0.4);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// ── 移动端适配：<768px 侧栏与预览改为浮层 ──
@media (max-width: 768px) {
  .topbar {
    padding: 0 8px 6px;
  }

  .workspace {
    margin: 0 8px 8px;
  }

  .brand-name {
    display: none; // 窄屏只留图标，给按钮腾空间
  }

  // 侧栏 → 左侧浮层抽屉
  .sidebar {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 40;
    width: min(80vw, 300px) !important;
    border-right: 1px solid var(--border-color);
    transform: translateX(-105%);
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: none;

    &.collapsed {
      width: min(80vw, 300px) !important;
      border-right-color: transparent;
      transform: translateX(-105%);
    }

    &:not(.collapsed) {
      transform: translateX(0);
      box-shadow: var(--shadow-pop);
    }
  }

  .sidebar-inner {
    width: 100%;
  }

  // 预览 → 右侧滑入接管全屏
  .preview {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 45;
    width: 100% !important;
    border-left: 1px solid var(--border-color);
    transform: translateX(105%);
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);

    &.collapsed {
      width: 100% !important;
      border-left-color: transparent;
      transform: translateX(105%);
    }

    &:not(.collapsed) {
      transform: translateX(0);
    }
  }

  // 大纲抽屉在窄屏上略窄
  .outline-drawer {
    width: min(58vw, 220px);
  }
}

// ── 大纲抽屉 ──
.outline-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 232px;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  z-index: 20;
}

.outline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px 12px;
  flex-shrink: 0;
}

.drawer-tabs {
  display: flex;
  gap: 2px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  padding: 2px;
}

.drawer-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover {
    color: var(--text-primary);
  }

  &.active {
    background: var(--bg-primary);
    color: var(--text-primary);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08);
  }
}

.tab-badge {
  font-size: 10px;
  background: var(--accent-color);
  color: #fff;
  border-radius: 8px;
  padding: 0 5px;
  line-height: 15px;
  font-weight: 600;
}

.outline-list {
  flex: 1;
  overflow: auto;
  padding: 2px 6px 12px;
}

.outline-item {
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.12s, color 0.12s;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.is-h1 {
    font-weight: 600;
    color: var(--text-primary);
  }

  &.is-h2 {
    font-weight: 500;
  }
}

.outline-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.9;

  .empty-sub {
    font-size: 11px;
    opacity: 0.8;
  }
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
  opacity: 0.4;
}
</style>

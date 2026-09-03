<template>
  <div class="app-shell">
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
          title="大纲"
          @click="onToggleOutline"
        >
          <n-icon size="17"><list-outline /></n-icon>
        </button>
        <button
          class="icon-btn"
          :class="{ active: ui.previewVisible }"
          :title="ui.previewVisible ? '收起预览分栏' : '展开预览分栏'"
          @click="ui.togglePreview"
        >
          <n-icon size="17"><grid-outline /></n-icon>
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

      <aside ref="previewColRef" class="preview" :class="{ collapsed: !ui.previewVisible }">
        <PreviewArea />
      </aside>

      <!-- ── 大纲抽屉（悬浮于工作区右侧） ── -->
      <transition name="drawer">
        <div v-if="ui.outlineVisible" class="outline-drawer">
          <div class="outline-header">
            <span class="outline-title">大纲</span>
            <button class="icon-btn sm" title="关闭大纲" @click="ui.toggleOutline">
              <n-icon size="14"><close-outline /></n-icon>
            </button>
          </div>
          <div v-if="outlineItems.length > 0" class="outline-list">
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
          </div>
          <div v-else class="outline-empty">暂无标题</div>
        </div>
      </transition>
    </div>

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
} from '@vicons/ionicons5'
import SideBar from '@/components/sidebar/SideBar.vue'
import EditorArea from '@/components/editor/EditorArea.vue'
import PreviewArea from '@/components/preview/PreviewArea.vue'
import SearchPanel from '@/components/search/SearchPanel.vue'
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

const outlineItems = computed<OutlineItem[]>(() => parseOutline(articleStore.currentContent))

function openSearch() {
  searchPanelRef.value?.open()
}

function onSearchSelect(id: string) {
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

function onToggleOutline() {
  ui.toggleOutline()
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
  padding: 12px 12px 8px 16px;
  flex-shrink: 0;
}

.outline-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
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

<template>
  <div class="editor-wrapper" @click="showSnapshots = false">
    <!-- 标签栏 -->
    <div class="tab-bar" v-if="articleStore.openTabs.length > 0" @click.stop>
      <div
        v-for="tabId in articleStore.openTabs"
        :key="tabId"
        class="tab-item"
        :class="{ active: articleStore.currentArticleId === tabId }"
        @click="articleStore.openTab(tabId)"
      >
        <span class="tab-title">{{ getTabTitle(tabId) }}</span>
        <button class="tab-close" @click.stop="articleStore.closeTab(tabId)">
          <n-icon size="12"><close-outline /></n-icon>
        </button>
      </div>
    </div>

    <!-- 标题行 -->
    <div class="title-row">
      <input
        v-if="articleStore.currentArticle"
        v-model="title"
        class="doc-title-input"
        placeholder="未命名"
        @blur="saveTitle"
        @keydown.enter="saveTitle"
      />
      <span v-else class="doc-title-placeholder">墨语笔记</span>

      <div class="title-actions" v-if="articleStore.currentArticle" @click.stop>
        <!-- 快照历史 -->
        <div class="snap-wrap">
          <button class="icon-btn" :class="{ active: showSnapshots }" title="快照历史（每 5 分钟自动保存）" @click="openSnapshots">
            <n-icon size="16"><time-outline /></n-icon>
          </button>
          <div v-if="showSnapshots" class="snap-panel">
            <div class="snap-header">快照历史</div>
            <div v-if="snapshots.length > 0" class="snap-list">
              <div v-for="snap in snapshots" :key="snap.id" class="snap-item" @click="restoreSnapshot(snap)">
                <span class="snap-time">{{ fmtTime(snap.createdAt) }}</span>
                <span class="snap-preview">{{ snap.content.replace(/\s+/g, ' ').slice(0, 40) }}</span>
              </div>
            </div>
            <div v-else class="snap-empty">暂无快照<br />编辑内容后每 5 分钟自动生成</div>
          </div>
        </div>

        <button class="icon-btn danger" title="删除笔记（可在回收站恢复）" @click="deleteArticle">
          <n-icon size="16"><trash-outline /></n-icon>
        </button>
      </div>
    </div>

    <!-- 编辑器 / 空状态 -->
    <div class="editor-body">
      <MonacoEditor
        v-if="articleStore.currentArticle"
        v-model="content"
        :theme="theme"
        :article-key="articleStore.currentArticleId"
        @change="onContentChange"
      />
      <div v-else class="editor-empty">
        <div class="empty-mark">墨</div>
        <h2 class="empty-title">{{ articleStore.articles.length > 0 ? '选择一篇笔记开始写作' : '开始你的第一篇笔记' }}</h2>
        <p class="empty-sub">所有内容保存在{{ articleStore.isFsMode ? '本地工作目录' : '你的浏览器中' }}，隐私安全</p>
        <div class="empty-actions">
          <button class="cta" @click="articleStore.createArticle">
            <n-icon size="16"><add-outline /></n-icon>
            新建笔记
          </button>
          <button v-if="!articleStore.isFsMode" class="cta ghost" @click="articleStore.openFolder">
            <n-icon size="16"><folder-outline /></n-icon>
            打开本地文件夹
          </button>
        </div>
        <p class="empty-hint">快捷键：Ctrl+P 搜索 · Ctrl+B 加粗 · Ctrl+K 插入链接</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { NIcon } from 'naive-ui'
import {
  CloseOutline,
  TimeOutline,
  TrashOutline,
  AddOutline,
  FolderOutline,
} from '@vicons/ionicons5'
import MonacoEditor from './MonacoEditor.vue'
import { useSettingStore } from '@/stores/setting'
import { useArticleStore } from '@/stores/article'
import { storeToRefs } from 'pinia'
import { useDebounce } from '@/composables/useDebounce'
import { getSnapshots } from '@/services/snapshot'
import type { Snapshot } from '@/types/article'

const settingStore = useSettingStore()
const articleStore = useArticleStore()
const { theme } = storeToRefs(settingStore)

const title = ref('')
const content = ref('')
const saveStatus = ref<'saved' | 'saving'>('saved')

// 内容同步：只在 currentContent 与本地不一致时写入（文章切换 / 快照恢复 / 异步文件读取）
// 打字过程中两者始终相等，因此不会触发 Monaco 的 setValue，杜绝光标跳动
watch(
  () => articleStore.currentContent,
  (val) => {
    if (val !== content.value) {
      content.value = val
      saveStatus.value = 'saved'
    }
  }
)

watch(
  () => articleStore.currentArticleId,
  () => {
    title.value = articleStore.currentArticle?.title ?? ''
  },
  { immediate: true }
)

const debouncedSave = useDebounce(async (newContent: string) => {
  if (!articleStore.currentArticle) return
  await articleStore.updateCurrentArticle({ content: newContent })
  saveStatus.value = 'saved'
}, 800)

const onContentChange = (newContent: string) => {
  saveStatus.value = 'saving'
  articleStore.currentContent = newContent
  debouncedSave(newContent)
}

const saveTitle = () => {
  if (!articleStore.currentArticle) return
  articleStore.updateCurrentArticle({ title: title.value })
}

function deleteArticle() {
  if (!articleStore.currentArticle) return
  if (confirm(`确定删除「${articleStore.currentArticle.title}」吗？\n可在回收站中恢复。`)) {
    articleStore.deleteCurrentArticle()
  }
}

// ── 快照历史 ──
const showSnapshots = ref(false)
const snapshots = ref<Snapshot[]>([])

async function openSnapshots() {
  showSnapshots.value = !showSnapshots.value
  if (showSnapshots.value && articleStore.currentArticle) {
    snapshots.value = await getSnapshots(articleStore.currentArticle.id)
  }
}

async function restoreSnapshot(snap: Snapshot) {
  if (!articleStore.currentArticle) return
  content.value = snap.content
  articleStore.currentContent = snap.content
  await articleStore.updateCurrentArticle({ content: snap.content })
  showSnapshots.value = false
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getTabTitle(id: string): string {
  return articleStore.articles.find((a) => a.id === id)?.title || '未命名'
}
</script>

<style scoped lang="scss">
.editor-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
}

// ── 标签栏（药丸样式） ──
.tab-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px 0;
  overflow-x: auto;
  flex-shrink: 0;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 5px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-tertiary);
  font-size: 12px;
  background: transparent;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;

  &:hover {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  &.active {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-weight: 500;
  }
}

.tab-title {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.12s, color 0.12s, background 0.12s;

  .tab-item:hover & {
    opacity: 0.7;
  }

  &:hover {
    opacity: 1;
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

// ── 标题行 ──
.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px 10px;
  flex-shrink: 0;
}

.doc-title-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 600;
  outline: none;
  padding: 4px 8px;
  margin-left: -8px;
  border-radius: var(--radius-sm);

  &:focus {
    background: var(--bg-tertiary);
  }

  &::placeholder {
    color: var(--text-tertiary);
  }
}

.doc-title-placeholder {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-tertiary);
}

.title-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.icon-btn {
  width: 30px;
  height: 30px;
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

  &.danger:hover {
    background: rgba(229, 83, 75, 0.1);
    color: var(--danger-color);
  }
}

// ── 快照下拉 ──
.snap-wrap {
  position: relative;
}

.snap-panel {
  position: absolute;
  top: 36px;
  right: 0;
  width: 300px;
  max-height: 320px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  z-index: 50;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.snap-header {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 12px 14px 8px;
  flex-shrink: 0;
}

.snap-list {
  overflow: auto;
  padding: 0 6px 8px;
}

.snap-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;

  &:hover {
    background: var(--bg-tertiary);
  }
}

.snap-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-color);
}

.snap-preview {
  font-size: 12px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snap-empty {
  padding: 20px 14px 24px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.8;
}

// ── 编辑器主体：约束到舒适阅读宽度，沉浸模式下居中成窄栏 ──
.editor-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  justify-content: center;

  > * {
    max-width: 860px;
    width: 100%;
  }
}

// ── 空状态欢迎页 ──
.editor-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-bottom: 60px;
}

.empty-mark {
  width: 72px;
  height: 72px;
  border-radius: 22px;
  background: var(--accent-soft);
  color: var(--accent-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
  font-weight: 700;
  margin-bottom: 24px;
}

.empty-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.empty-sub {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: 28px;
}

.empty-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 32px;
}

.cta {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent-color);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;

  &:hover {
    background: var(--accent-hover);
  }

  &:active {
    transform: scale(0.97);
  }

  &.ghost {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-strong);

    &:hover {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }
  }
}

.empty-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  opacity: 0.7;
}
</style>

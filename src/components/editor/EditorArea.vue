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
        <n-icon v-if="isTabEncrypted(tabId)" size="11" class="tab-lock"><lock-closed-outline /></n-icon>
        <span class="tab-title">{{ getTabTitle(tabId) }}</span>
        <button class="tab-close" @click.stop="articleStore.closeTab(tabId)">
          <n-icon size="12"><close-outline /></n-icon>
        </button>
      </div>
    </div>

    <!-- 标题行 -->
    <div class="title-row">
      <n-icon v-if="articleStore.currentEncrypted" size="14" class="title-lock" title="加密笔记">
        <lock-closed-outline />
      </n-icon>
      <input
        v-if="articleStore.currentArticle"
        ref="titleInputRef"
        v-model="title"
        class="doc-title-input"
        placeholder="未命名"
        @blur="saveTitle"
        @keydown.enter="saveTitle"
      />
      <span v-else class="doc-title-placeholder">墨语笔记</span>

      <div class="title-actions" v-if="articleStore.currentArticle" @click.stop>
        <!-- 导出 -->
        <button class="icon-btn" title="导出为 .md 文件" @click="exportCurrent">
          <n-icon size="16"><download-outline /></n-icon>
        </button>
        <!-- 加密 / 解锁后重新锁定 -->
        <button
          class="icon-btn"
          :title="articleStore.currentEncrypted ? '重新锁定笔记' : '加密此笔记'"
          @click="onLockClick"
        >
          <n-icon size="16">
            <lock-open-outline v-if="articleStore.currentEncrypted" />
            <lock-closed-outline v-else />
          </n-icon>
        </button>
        <!-- 快照历史（加密笔记不可用） -->
        <div class="snap-wrap" v-if="!articleStore.currentEncrypted">
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

    <!-- 编辑器 / 锁屏 / 空状态 -->
    <div class="editor-body">
      <template v-if="articleStore.currentArticle">
        <!-- 解锁后的编辑器 -->
        <MonacoEditor
          v-if="!articleStore.currentLocked"
          ref="monacoRef"
          v-model="content"
          :theme="theme"
          :article-key="articleStore.currentArticleId"
          @change="onContentChange"
          @image-paste="onImagePaste"
        />
        <!-- 加密锁屏 -->
        <div v-else class="lock-screen">
          <div class="lock-mark">
            <n-icon size="26"><lock-closed-outline /></n-icon>
          </div>
          <div class="lock-title">此笔记已加密</div>
          <p class="lock-sub">输入密码解锁查看与编辑，数据以 AES-GCM 加密存储</p>
          <form class="lock-form" @submit.prevent="doUnlock">
            <input
              v-model="unlockPw"
              type="password"
              class="lock-input"
              placeholder="输入密码"
              autofocus
            />
            <button type="submit" class="lock-btn">
              <n-icon size="15"><lock-open-outline /></n-icon>
              解锁
            </button>
          </form>
          <div v-if="unlockError" class="lock-error">{{ unlockError }}</div>
        </div>
      </template>

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
        <p class="empty-hint">快捷键：Ctrl+P 搜索 · Ctrl+B 加粗 · Ctrl+K 插入链接 · [[ 双链笔记</p>
      </div>
    </div>

    <!-- 加密设置密码弹窗 -->
    <PasswordDialog v-model="showPwDialog" title="加密此笔记" mode="set" @confirm="doEncrypt" />
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
  LockClosedOutline,
  LockOpenOutline,
  DownloadOutline,
} from '@vicons/ionicons5'
import MonacoEditor from './MonacoEditor.vue'
import PasswordDialog from '@/components/common/PasswordDialog.vue'
import { useSettingStore } from '@/stores/setting'
import { useArticleStore } from '@/stores/article'
import { storeToRefs } from 'pinia'
import { useDebounce } from '@/composables/useDebounce'
import { getSnapshots } from '@/services/snapshot'
import { saveAsset } from '@/services/assets'
import { exportArticle } from '@/services/export'
import type { Snapshot } from '@/types/article'

const settingStore = useSettingStore()
const articleStore = useArticleStore()
const { theme } = storeToRefs(settingStore)

const title = ref('')
const content = ref('')
const monacoRef = ref<InstanceType<typeof MonacoEditor>>()
const titleInputRef = ref<HTMLInputElement>()
const unlockPw = ref('')
const unlockError = ref('')

// 内容同步：只在 currentContent 与本地不一致时写入（文章切换 / 快照恢复 / 解锁）
// 打字过程中两者始终相等，因此不会触发 Monaco 的 setValue，杜绝光标跳动
watch(
  () => articleStore.currentContent,
  (val) => {
    if (val !== content.value) {
      content.value = val
    }
  }
)

watch(
  () => articleStore.currentArticleId,
  () => {
    title.value = articleStore.currentArticle?.title ?? ''
    unlockPw.value = ''
    unlockError.value = ''
  },
  { immediate: true }
)

// 标题在外部被修改（如双链自动建名、FS 重命名）时同步输入框；正在输入时不覆盖
watch(
  () => articleStore.currentArticle?.title,
  (t) => {
    if (document.activeElement !== titleInputRef.value) {
      title.value = t ?? ''
    }
  }
)

const debouncedSave = useDebounce(async (newContent: string) => {
  if (!articleStore.currentArticle) return
  await articleStore.updateCurrentArticle({ content: newContent })
}, 800)

const onContentChange = (newContent: string) => {
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

// ── 图片粘贴 ──
async function onImagePaste(file: File) {
  if (!articleStore.currentArticle) return
  const id = await saveAsset(file, articleStore.currentArticle.id)
  const name = file.name.replace(/\.[a-z0-9]+$/i, '') || '图片'
  monacoRef.value?.insertText(`![${name}](asset://${id})`)
}

// ── 加密 / 解锁 ──
const showPwDialog = ref(false)

function onLockClick() {
  if (articleStore.currentEncrypted) {
    // 已加密且解锁中 → 重新锁定
    articleStore.lockCurrent()
  } else {
    showPwDialog.value = true
  }
}

async function doEncrypt(password: string) {
  const ok = await articleStore.encryptCurrent(password)
  if (!ok) alert('加密失败')
}

async function doUnlock() {
  unlockError.value = ''
  if (!unlockPw.value) return
  const ok = await articleStore.unlockCurrent(unlockPw.value)
  if (!ok) {
    unlockError.value = '密码错误，请重试'
    unlockPw.value = ''
  }
}

function isTabEncrypted(id: string): boolean {
  const art = articleStore.articles.find((a) => a.id === id)
  return !!art && art.encrypted === 1
}

// ── 导出 ──
function exportCurrent() {
  const art = articleStore.currentArticle
  if (!art) return
  if (articleStore.currentLocked) {
    alert('笔记已加密，请先解锁后再导出')
    return
  }
  exportArticle(art, content.value)
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

.tab-lock {
  color: var(--warning-color);
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

.title-lock {
  color: var(--warning-color);
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

// ── 加密锁屏 ──
.lock-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-bottom: 40px;
}

.lock-mark {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: rgba(210, 153, 34, 0.12);
  color: var(--warning-color);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}

.lock-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.lock-sub {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: 24px;
}

.lock-form {
  display: flex;
  gap: 8px;
}

.lock-input {
  width: 220px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
  padding: 9px 12px;
  outline: none;
  transition: border-color 0.15s;

  &:focus {
    border-color: var(--accent-color);
  }

  &::placeholder {
    color: var(--text-tertiary);
  }
}

.lock-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent-color);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: var(--accent-hover);
  }
}

.lock-error {
  margin-top: 12px;
  font-size: 12px;
  color: var(--danger-color);
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

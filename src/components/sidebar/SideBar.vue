<template>
  <div class="sidebar-content">
    <!-- 上次工作目录未连接提示（浏览器要求手势授权，需手动重连） -->
    <div v-if="articleStore.pendingWorkspace" class="reconnect-bar">
      <div class="reconnect-text">
        上次的工作目录「{{ articleStore.pendingWorkspace.name }}」未连接
      </div>
      <div class="reconnect-actions">
        <button class="reconnect-btn primary" @click="articleStore.reconnectWorkspace">
          重新连接
        </button>
        <button class="reconnect-btn" @click="articleStore.dismissPendingWorkspace">忽略</button>
      </div>
    </div>

    <!-- 工作目录状态 -->
    <div class="workspace-bar" v-if="articleStore.isFsMode">
      <n-icon size="14" class="ws-icon"><folder-open-outline /></n-icon>
      <span class="ws-name" :title="articleStore.workspaceName">{{ articleStore.workspaceName }}</span>
      <button class="ws-close" @click="articleStore.closeWorkspace" title="关闭工作目录">✕</button>
    </div>
    <button v-else class="btn-open-folder" @click="articleStore.openFolder">
      <n-icon size="14"><folder-outline /></n-icon>
      打开本地文件夹
    </button>

    <FileTree
      :articles="articleStore.visibleArticles"
      :current-id="articleStore.currentArticleId"
      @select="articleStore.selectArticle"
      @create="articleStore.createArticle"
      @import="onImport"
      :show-import="true"
    />

    <!-- 回收站 -->
    <button class="trash-toggle" @click="articleStore.toggleTrash">
      <n-icon size="15"><trash-outline /></n-icon>
      <span>回收站</span>
      <n-icon v-if="articleStore.showTrash" size="13" class="chevron"><chevron-down-outline /></n-icon>
      <n-icon v-else size="13" class="chevron"><chevron-forward-outline /></n-icon>
    </button>

    <div v-if="articleStore.showTrash" class="trash-panel">
      <div class="trash-list" v-if="articleStore.trashArticles.length > 0">
        <div v-for="item in articleStore.trashArticles" :key="item.id" class="trash-item">
          <span class="trash-title">{{ item.title || '未命名' }}</span>
          <div class="trash-actions">
            <button class="trash-btn restore" @click="articleStore.restoreArticle(item.id)" title="恢复">
              <n-icon size="14"><arrow-undo-outline /></n-icon>
            </button>
            <button class="trash-btn delete" @click="articleStore.permanentlyDeleteArticle(item.id)" title="永久删除">
              <n-icon size="14"><close-outline /></n-icon>
            </button>
          </div>
        </div>
      </div>
      <div v-else class="trash-empty">回收站是空的</div>
    </div>

    <!-- 导出全部 -->
    <button class="export-all" title="把全部笔记打包导出为 zip" @click="onExportAll" :disabled="exporting">
      <n-icon size="14"><archive-outline /></n-icon>
      {{ exporting ? '打包中…' : '导出全部 (.zip)' }}
    </button>

    <!-- WebDAV 同步 -->
    <button class="export-all" title="通过 WebDAV 在多台设备间同步笔记" @click="showSync = true">
      <n-icon size="14"><sync-outline /></n-icon>
      WebDAV 同步
    </button>

    <!-- 危险区：清空全部数据 -->
    <button class="wipe-all" title="删除本机全部笔记数据，不可恢复" @click="onWipeAll">
      <n-icon size="14"><warning-outline /></n-icon>
      清空全部数据
    </button>

    <div class="footer">本地优先 · 数据保存在你的设备上</div>

    <SyncPanel v-model="showSync" />

    <!-- DB 模式导入用隐藏文件选择器 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".md,text/markdown"
      multiple
      style="display: none"
      @change="onFilesChosen"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NIcon } from 'naive-ui'
import {
  FolderOutline,
  FolderOpenOutline,
  TrashOutline,
  ChevronDownOutline,
  ChevronForwardOutline,
  ArrowUndoOutline,
  CloseOutline,
  ArchiveOutline,
  SyncOutline,
  WarningOutline,
} from '@vicons/ionicons5'
import FileTree from './FileTree.vue'
import SyncPanel from '@/components/sync/SyncPanel.vue'
import { useArticleStore } from '@/stores/article'
import { exportAllZip } from '@/services/export'

const articleStore = useArticleStore()

const fileInputRef = ref<HTMLInputElement>()
const exporting = ref(false)
const showSync = ref(false)

async function onImport() {
  if (articleStore.isFsMode) {
    await articleStore.importMarkdownFile()
    return
  }
  fileInputRef.value?.click()
}

async function onFilesChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  for (const f of files) {
    const content = await f.text()
    await articleStore.importArticleFromDb(f.name, content)
  }
  input.value = ''
}

async function onExportAll() {
  if (exporting.value) return
  exporting.value = true
  try {
    await exportAllZip()
    articleStore.markBackedUp() // 全量导出即一次备份
  } finally {
    exporting.value = false
  }
}

async function onWipeAll() {
  const total = articleStore.articles.length + articleStore.trashArticles.length
  if (!confirm(`确定清空全部数据吗？\n本机共 ${total || '若干'} 篇笔记（含回收站）将被永久删除。`)) return
  if (!confirm('最后确认：此操作不可恢复，所有笔记、快照、图片与同步配置都会被删除。')) return
  await articleStore.wipeAllData()
}
</script>

<style scoped lang="scss">
.sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 14px 12px 10px;
}

.reconnect-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid var(--warning-color);
  border-radius: var(--radius-md);
  background: rgba(210, 153, 34, 0.08);
}

.reconnect-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
  word-break: break-all;
}

.reconnect-actions {
  display: flex;
  gap: 6px;
}

.reconnect-btn {
  flex: 1;
  padding: 5px 0;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.primary {
    background: var(--accent-color);
    border-color: var(--accent-color);
    color: #fff;

    &:hover {
      background: var(--accent-hover);
    }
  }
}

.workspace-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  margin-bottom: 8px;
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  font-size: 12px;
  color: var(--text-secondary);

  .ws-icon {
    flex-shrink: 0;
    color: var(--accent-color);
  }

  .ws-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ws-close {
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    font-size: 13px;
    padding: 0 3px;
    line-height: 1;
    border-radius: 4px;
    &:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }
  }
}

.btn-open-folder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 8px 10px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 12px;
  margin-bottom: 8px;
  transition: all 0.15s;
  &:hover {
    background: var(--accent-soft);
    color: var(--accent-color);
    border-color: var(--accent-color);
  }
}

// ── 回收站 ──
.trash-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 12px;
  margin-top: 6px;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .chevron {
    margin-left: auto;
  }
}

.trash-panel {
  flex-shrink: 0;
  max-height: 200px;
  overflow: auto;
  padding: 0 2px 2px;
}

.trash-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.trash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  &:hover {
    background: var(--bg-hover);
  }
}

.trash-title {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.trash-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.trash-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 3px 5px;
  border-radius: 4px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  &:hover {
    background: var(--bg-tertiary);
  }
  &.restore:hover {
    color: var(--accent-color);
  }
  &.delete:hover {
    color: var(--danger-color);
  }
}

.trash-empty {
  padding: 12px 8px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
}

// ── 导出全部 ──
.export-all {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 12px;
  margin-top: 2px;
  transition: background 0.15s, color 0.15s;

  &:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

// ── 危险区：清空全部数据 ──
.wipe-all {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 12px;
  margin-top: 2px;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: rgba(229, 83, 75, 0.08);
    color: var(--danger-color);
  }
}

.footer {
  font-size: 11px;
  color: var(--text-tertiary);
  text-align: center;
  padding: 10px 0 2px;
  border-top: 1px solid var(--border-color);
  margin-top: auto;
}
</style>

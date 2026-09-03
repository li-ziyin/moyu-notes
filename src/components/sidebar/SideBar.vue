<template>
  <div class="sidebar-content">
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
      :articles="articleStore.articles"
      :current-id="articleStore.currentArticleId"
      @select="articleStore.selectArticle"
      @create="articleStore.createArticle"
      @import="articleStore.importMarkdownFile"
      :show-import="articleStore.isFsMode"
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

    <div class="footer">本地优先 · 数据保存在你的设备上</div>
  </div>
</template>

<script setup lang="ts">
import { NIcon } from 'naive-ui'
import {
  FolderOutline,
  FolderOpenOutline,
  TrashOutline,
  ChevronDownOutline,
  ChevronForwardOutline,
  ArrowUndoOutline,
  CloseOutline,
} from '@vicons/ionicons5'
import FileTree from './FileTree.vue'
import { useArticleStore } from '@/stores/article'

const articleStore = useArticleStore()
</script>

<style scoped lang="scss">
.sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 14px 12px 10px;
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

.footer {
  font-size: 11px;
  color: var(--text-tertiary);
  text-align: center;
  padding: 10px 0 2px;
  border-top: 1px solid var(--border-color);
  margin-top: auto;
}
</style>

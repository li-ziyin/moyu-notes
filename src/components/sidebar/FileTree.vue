<template>
  <div class="file-tree">
    <div class="tree-header">
      <span class="tree-title">笔记</span>
      <span v-if="articles.length > 0" class="tree-count">{{ articles.length }}</span>
      <div class="tree-actions">
        <button v-if="showImport" class="tree-btn" @click="onImport" title="导入 .md 文件">
          <n-icon size="15">
            <cloud-upload-outline />
          </n-icon>
        </button>
        <button class="tree-btn" @click="onCreate" title="新建笔记">
          <n-icon size="15">
            <add-outline />
          </n-icon>
        </button>
      </div>
    </div>
    <div ref="scrollRef" class="tree-scroll">
      <div class="tree-spacer" :style="{ height: totalHeight + 'px' }">
        <div class="tree-window" :style="{ transform: `translateY(${offsetY}px)` }">
          <div
            v-for="article in visibleItems"
            :key="article.id"
            class="tree-item"
            :class="{ active: currentId === article.id }"
            :style="{ height: ITEM_HEIGHT + 'px' }"
            @click="onSelect(article.id)"
          >
            <n-icon size="14" class="item-icon">
              <document-text-outline />
            </n-icon>
            <span class="item-title">{{ article.title || '未命名' }}</span>
          </div>
        </div>
      </div>
      <div v-if="articles.length === 0" class="tree-empty">
        {{ showImport ? '暂无笔记，点击 + 新建 或导入' : '暂无笔记，点击 + 新建' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, toRef } from 'vue'
import { NIcon } from 'naive-ui'
import { AddOutline, DocumentTextOutline, CloudUploadOutline } from '@vicons/ionicons5'
import type { Article } from '@/types/article'
import { useVirtualList } from '@/composables/useVirtualList'

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

const scrollRef = ref<HTMLElement | null>(null)
const { visibleItems, offsetY, totalHeight } = useVirtualList(
  scrollRef,
  toRef(props, 'articles'),
  ITEM_HEIGHT
)

const onSelect = (id: string) => emit('select', id)
const onCreate = () => emit('create')
const onImport = () => emit('import')
</script>

<style scoped lang="scss">
.file-tree {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 6px;
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
}

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
  gap: 8px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  transition: background 0.12s, color 0.12s;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    background: var(--accent-soft);
    color: var(--accent-color);
    font-weight: 500;
  }
}

.item-icon {
  flex-shrink: 0;
  opacity: 0.75;
}

.item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-empty {
  padding: 24px 8px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}
</style>

<template>
  <div v-if="visible" class="search-overlay" @click.self="close">
    <div class="search-panel">
      <div class="search-input-wrap">
        <n-icon size="18" class="search-icon"><search-outline /></n-icon>
        <input
          ref="inputRef"
          v-model="query"
          class="search-input"
          placeholder="搜索笔记标题或内容..."
          @input="onSearch"
          @keydown.escape="close"
          @keydown.enter="selectFirst"
        />
        <span class="search-hint">Esc 关闭</span>
      </div>
      <div class="search-results" v-if="results.length > 0">
        <div
          v-for="item in results"
          :key="item.id"
          class="search-item"
          :class="{ active: selectedIdx === results.indexOf(item) }"
          @click="select(item)"
          @mouseenter="selectedIdx = results.indexOf(item)"
        >
          <n-icon size="16" class="result-icon"><document-text-outline /></n-icon>
          <div class="result-info">
            <div class="result-title" v-html="highlight(item.title, query)"></div>
            <div class="result-excerpt" v-html="highlight(trimContent(item.content), query)"></div>
          </div>
        </div>
      </div>
      <div class="search-empty" v-else-if="query && results.length === 0">
        无匹配结果
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { NIcon } from 'naive-ui'
import { SearchOutline, DocumentTextOutline } from '@vicons/ionicons5'
import type { SearchDoc } from '@/services/search'
import { search as doSearch } from '@/services/search'

const visible = ref(false)
const query = ref('')
const results = ref<SearchDoc[]>([])
const selectedIdx = ref(0)
const inputRef = ref<HTMLInputElement>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

function open() {
  visible.value = true
  query.value = ''
  results.value = []
  selectedIdx.value = 0
  nextTick(() => inputRef.value?.focus())
}

function close() {
  visible.value = false
}

function onSearch() {
  selectedIdx.value = 0
  results.value = doSearch(query.value)
}

function select(item: SearchDoc) {
  emit('select', item.id)
  close()
}

function selectFirst() {
  if (results.value.length > 0) {
    select(results.value[selectedIdx.value])
  }
}

function highlight(text: string, keyword: string): string {
  if (!keyword.trim()) return escapeHtml(text)
  const escaped = escapeHtml(text)
  const kw = escapeHtml(keyword)
  // 简单高亮：不区分大小写
  const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return escaped.replace(regex, '<mark>$1</mark>')
}

function trimContent(content: string): string {
  return content.replace(/\s+/g, ' ').slice(0, 120)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

defineExpose({ open, close })
</script>

<style scoped lang="scss">
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  display: flex;
  justify-content: center;
  padding-top: 15vh;
}

.search-panel {
  width: 560px;
  max-height: 460px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  align-self: flex-start;
}

.search-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}

.search-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 15px;
  &::placeholder {
    color: var(--text-tertiary);
  }
}

.search-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.search-results {
  overflow: auto;
  padding: 4px;
}

.search-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;

  &:hover,
  &.active {
    background: var(--bg-tertiary);
  }
}

.result-icon {
  margin-top: 2px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
  :deep(mark) {
    background: var(--accent-color);
    color: #fff;
    padding: 0 2px;
    border-radius: 2px;
  }
}

.result-excerpt {
  font-size: 12px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  :deep(mark) {
    background: var(--accent-soft);
    color: var(--accent-color);
    padding: 0 1px;
    border-radius: 1px;
  }
}

.search-empty {
  padding: 32px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 14px;
}
</style>

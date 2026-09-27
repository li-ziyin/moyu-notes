<template>
  <div class="status-bar">
    <div class="status-group">
      <span>字数 {{ wordCount }}</span>
      <span class="status-divider"></span>
      <span>字符 {{ charCount }}</span>
    </div>
    <div class="status-group">
      <span>行 {{ cursorPos.line }}，列 {{ cursorPos.column }}</span>
      <span class="status-divider"></span>
      <button
        class="focus-toggle"
        :class="{ active: typewriter }"
        :title="typewriter ? '关闭专注模式（打字机滚动 + 当前行高亮）' : '开启专注模式（打字机滚动 + 当前行高亮）'"
        @click="emit('update:typewriter', !typewriter)"
      >
        专注
      </button>
      <span class="status-divider"></span>
      <span class="save-state" :class="saveStatus">
        <span class="save-dot"></span>
        {{ saveStatus === 'saved' ? '已保存' : '保存中…' }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  wordCount: number
  charCount: number
  cursorPos: { line: number; column: number }
  saveStatus: 'saved' | 'saving'
  typewriter: boolean
}>()

const emit = defineEmits<{
  (e: 'update:typewriter', v: boolean): void
}>()
</script>

<style scoped lang="scss">
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 20px;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  user-select: none;
}

.status-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-divider {
  width: 1px;
  height: 10px;
  background: var(--border-color);
}

.focus-toggle {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11px;
  cursor: pointer;
  padding: 1px 7px;
  border-radius: 999px;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  &.active {
    background: var(--accent-soft);
    color: var(--accent-color);
    font-weight: 600;
  }
}

.save-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.save-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success-color);
}

.save-state.saving .save-dot {
  background: var(--warning-color);
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>

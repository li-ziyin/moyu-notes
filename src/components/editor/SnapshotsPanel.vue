<template>
  <div class="snap-wrap" v-if="articleStore.currentArticle">
    <button
      class="icon-btn"
      :class="{ active: showSnapshots }"
      title="快照历史（每 5 分钟自动保存）"
      @click="openSnapshots"
    >
      <n-icon size="16"><time-outline /></n-icon>
    </button>
    <div v-if="showSnapshots" class="snap-panel" @click.stop>
      <div class="snap-header">快照历史</div>
      <div v-if="snapshots.length > 0" class="snap-list">
        <div v-for="snap in snapshots" :key="snap.id" class="snap-item" @click="onPick(snap)">
          <span class="snap-time">
            {{ fmtTime(snap.createdAt) }}
            <span v-if="snap.label" class="snap-label">{{ snap.label }}</span>
          </span>
          <span class="snap-preview">{{ snap.content.replace(/\s+/g, ' ').slice(0, 40) }}</span>
        </div>
      </div>
      <div v-else class="snap-empty">暂无快照<br />编辑内容后每 5 分钟自动生成</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NIcon } from 'naive-ui'
import { TimeOutline } from '@vicons/ionicons5'
import { useArticleStore } from '@/stores/article'
import { getSnapshots } from '@/services/snapshot'
import type { Snapshot } from '@/types/article'

const articleStore = useArticleStore()
const emit = defineEmits<{
  (e: 'restore', snap: Snapshot): void
}>()

const showSnapshots = ref(false)
const snapshots = ref<Snapshot[]>([])

async function openSnapshots() {
  showSnapshots.value = !showSnapshots.value
  if (showSnapshots.value && articleStore.currentArticle) {
    snapshots.value = await getSnapshots(articleStore.currentArticle.id)
  }
}

function onPick(snap: Snapshot) {
  emit('restore', snap)
  close()
}

function close() {
  showSnapshots.value = false
}

defineExpose({ close })

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped lang="scss">
.snap-wrap {
  position: relative;
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
  display: flex;
  align-items: center;
  gap: 6px;
}

.snap-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--warning-color);
  background: rgba(210, 153, 34, 0.12);
  border-radius: 4px;
  padding: 0 5px;
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
</style>

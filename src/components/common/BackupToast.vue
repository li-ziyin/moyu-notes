<template>
  <transition name="backup-toast">
    <div v-if="articleStore.backupReminderVisible" class="backup-toast" role="alert">
      <div class="toast-icon">
        <n-icon size="17"><cloud-upload-outline /></n-icon>
      </div>
      <div class="toast-body">
        <div class="toast-title">备份提醒</div>
        <div class="toast-desc">笔记保存在浏览器中，已超过 7 天未备份，建议导出存档以防丢失</div>
        <div class="toast-actions">
          <button class="toast-btn primary" :disabled="exporting" @click="onExport">
            {{ exporting ? '打包中…' : '立即导出' }}
          </button>
          <button class="toast-btn" @click="dismiss">暂不需要</button>
        </div>
      </div>
      <button class="toast-close" title="关闭" @click="dismiss">
        <n-icon size="12"><close-outline /></n-icon>
      </button>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { NIcon } from 'naive-ui'
import { CloudUploadOutline, CloseOutline } from '@vicons/ionicons5'
import { useArticleStore } from '@/stores/article'
import { exportAllZip } from '@/services/export'

const articleStore = useArticleStore()
const exporting = ref(false)
let autoDismissTimer: number | null = null

// 出现后 12 秒无操作自动收起（与手动关闭同样：当天不再提醒）
watch(
  () => articleStore.backupReminderVisible,
  (visible) => {
    if (visible) {
      autoDismissTimer = window.setTimeout(dismiss, 12000)
    } else if (autoDismissTimer) {
      clearTimeout(autoDismissTimer)
      autoDismissTimer = null
    }
  }
)

onBeforeUnmount(() => {
  if (autoDismissTimer) clearTimeout(autoDismissTimer)
})

function dismiss() {
  articleStore.dismissBackupReminder()
}

async function onExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    await exportAllZip()
    articleStore.markBackedUp()
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped lang="scss">
.backup-toast {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 130; // 高于大纲抽屉与同步弹窗，低于搜索（200）
  width: 316px;
  display: flex;
  gap: 12px;
  padding: 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
}

.toast-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(210, 153, 34, 0.14);
  color: var(--warning-color);
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast-body {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 3px;
}

.toast-desc {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.toast-actions {
  display: flex;
  gap: 6px;
}

.toast-btn {
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  border: none;
  transition: background 0.15s, color 0.15s;

  &.primary {
    background: var(--accent-color);
    color: #fff;

    &:hover:not(:disabled) {
      background: var(--accent-hover);
    }

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }

  &:not(.primary) {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-strong);

    &:hover {
      background: var(--bg-tertiary);
    }
  }
}

.toast-close {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

// 滑入 / 滑出动画
.backup-toast-enter-active,
.backup-toast-leave-active {
  transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.32s ease;
}

.backup-toast-enter-from,
.backup-toast-leave-to {
  transform: translateY(-12px);
  opacity: 0;
}
</style>

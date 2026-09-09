<template>
  <div v-if="modelValue" class="sync-overlay" @click.self="close">
    <div class="sync-panel">
      <div class="sync-header">
        <div class="sync-title">
          <n-icon size="16"><sync-outline /></n-icon>
          WebDAV 同步
        </div>
        <button class="close-btn" title="关闭" @click="close">
          <n-icon size="14"><close-outline /></n-icon>
        </button>
      </div>

      <div class="sync-body">
        <label class="field">
          <span class="field-label">服务器地址</span>
          <input v-model="form.url" class="field-input" placeholder="https://dav.example.com/dav/" spellcheck="false" />
        </label>
        <label class="field">
          <span class="field-label">账号</span>
          <input v-model="form.username" class="field-input" placeholder="用户名" spellcheck="false" autocomplete="off" />
        </label>
        <label class="field">
          <span class="field-label">应用密码</span>
          <input v-model="form.password" type="password" class="field-input" placeholder="密码 / 应用专用密码" autocomplete="new-password" />
        </label>
        <label class="field">
          <span class="field-label">远程目录</span>
          <input v-model="form.basePath" class="field-input" placeholder="moyu-notes" spellcheck="false" />
        </label>

        <div class="sync-hint">
          同步策略：按文件名对齐、修改时间新者胜；仅远端有的文件会导入为新笔记。
          密码只保存在本机浏览器中。需服务端允许跨域（自建服务可配置）。
        </div>

        <div v-if="lastSyncText" class="last-sync">上次同步：{{ lastSyncText }}</div>
        <div v-if="reportText" class="sync-report">{{ reportText }}</div>
        <div v-if="errorText" class="sync-error">{{ errorText }}</div>
      </div>

      <div class="sync-actions">
        <button class="sync-btn ghost" @click="onTest" :disabled="busy">
          {{ testing ? '测试中…' : '测试连接' }}
        </button>
        <button class="sync-btn ghost" @click="onSave" :disabled="busy">保存配置</button>
        <button class="sync-btn primary" @click="onSync" :disabled="busy">
          {{ syncing ? '同步中…' : '立即同步' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { NIcon } from 'naive-ui'
import { SyncOutline, CloseOutline } from '@vicons/ionicons5'
import {
  type WebDAVConfig,
  davTest,
  syncWithWebDAV,
  loadSyncConfig,
  saveSyncConfig,
  getLastSyncTime,
  setLastSyncTime,
} from '@/services/sync'
import { useArticleStore } from '@/stores/article'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const articleStore = useArticleStore()

const form = ref<WebDAVConfig>({
  url: '',
  username: '',
  password: '',
  basePath: 'moyu-notes',
})
const testing = ref(false)
const syncing = ref(false)
const busy = ref(false)
const reportText = ref('')
const errorText = ref('')
const lastSyncText = ref('')

watch(
  () => props.modelValue,
  async (v) => {
    if (!v) return
    reportText.value = ''
    errorText.value = ''
    const saved = loadSyncConfig()
    if (saved) form.value = { ...saved, basePath: saved.basePath || 'moyu-notes' }
    const ts = getLastSyncTime()
    lastSyncText.value = ts ? formatTime(ts) : ''
    busy.value = false
    await nextTick()
  }
)

function close() {
  if (busy.value) return
  emit('update:modelValue', false)
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function buildConfig(): WebDAVConfig | null {
  const cfg: WebDAVConfig = {
    url: form.value.url.trim(),
    username: form.value.username.trim(),
    password: form.value.password,
    basePath: form.value.basePath.trim() || 'moyu-notes',
  }
  if (!cfg.url || !cfg.username) {
    errorText.value = '请填写服务器地址与账号'
    return null
  }
  return cfg
}

async function onTest() {
  errorText.value = ''
  const cfg = buildConfig()
  if (!cfg) return
  testing.value = true
  busy.value = true
  try {
    const ok = await davTest(cfg)
    if (ok) {
      reportText.value = '连接成功 ✓'
    } else {
      errorText.value = '连接失败：请检查地址与账号'
    }
  } catch (e) {
    errorText.value = `连接失败：${e instanceof Error ? e.message : e}（常见原因：服务端未开启跨域）`
  } finally {
    testing.value = false
    busy.value = false
  }
}

function onSave() {
  errorText.value = ''
  const cfg = buildConfig()
  if (!cfg) return
  saveSyncConfig(cfg)
  reportText.value = '配置已保存 ✓'
}

async function onSync() {
  errorText.value = ''
  reportText.value = ''
  const cfg = buildConfig()
  if (!cfg) return
  saveSyncConfig(cfg)
  syncing.value = true
  busy.value = true
  try {
    const report = await syncWithWebDAV(cfg, articleStore.articles)
    await articleStore.refreshAfterExternalSync()
    articleStore.markBackedUp() // 同步成功 = 远端已有一份完整存档
    setLastSyncTime(Date.now())
    lastSyncText.value = formatTime(Date.now())
    reportText.value =
      `同步完成：上传 ${report.uploaded} · 下载 ${report.downloaded} · ` +
      `新导入 ${report.created} · 清理远端 ${report.removedRemote}` +
      (report.conflicts ? ` · 跳过 ${report.conflicts} 篇加密笔记（远端内容有更新，请解锁后在应用内手动合并）` : '')
  } catch (e) {
    errorText.value = `同步失败：${e instanceof Error ? e.message : e}（常见原因：服务端未开启跨域）`
  } finally {
    syncing.value = false
    busy.value = false
  }
}
</script>

<style scoped lang="scss">
.sync-overlay {
  position: fixed;
  inset: 0;
  z-index: 110;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 16vh;
}

.sync-panel {
  width: 400px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
}

.sync-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
}

.sync-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);

  svg {
    color: var(--accent-color);
  }
}

.close-btn {
  width: 24px;
  height: 24px;
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

.sync-body {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.field-input {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  padding: 8px 10px;
  outline: none;
  transition: border-color 0.15s;

  &:focus {
    border-color: var(--accent-color);
  }

  &::placeholder {
    color: var(--text-tertiary);
  }
}

.sync-hint {
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-tertiary);
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 8px 10px;
}

.last-sync {
  font-size: 12px;
  color: var(--text-tertiary);
}

.sync-report {
  font-size: 12px;
  color: var(--success-color);
  line-height: 1.6;
}

.sync-error {
  font-size: 12px;
  color: var(--danger-color);
  line-height: 1.6;
  word-break: break-all;
}

.sync-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 16px 16px;
}

.sync-btn {
  padding: 8px 14px;
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  border: none;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  &.primary {
    background: var(--accent-color);
    color: #fff;

    &:hover:not(:disabled) {
      background: var(--accent-hover);
    }
  }

  &.ghost {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-strong);

    &:hover:not(:disabled) {
      background: var(--bg-tertiary);
    }
  }
}
</style>

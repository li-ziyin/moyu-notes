<template>
  <div class="lock-screen">
    <div class="lock-mark">
      <n-icon size="26"><lock-closed-outline /></n-icon>
    </div>
    <div class="lock-title">此笔记已加密</div>
    <p class="lock-sub">输入密码解锁查看与编辑，密码不会上传到任何服务器</p>
    <form class="lock-form" @submit.prevent="doUnlock">
      <input v-model="unlockPw" type="password" class="lock-input" placeholder="输入密码" autofocus />
      <button type="submit" class="lock-btn">
        <n-icon size="15"><lock-open-outline /></n-icon>
        解锁
      </button>
    </form>
    <div v-if="unlockError" class="lock-error">{{ unlockError }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { NIcon } from 'naive-ui'
import { LockClosedOutline, LockOpenOutline } from '@vicons/ionicons5'
import { useArticleStore } from '@/stores/article'

const articleStore = useArticleStore()

const unlockPw = ref('')
const unlockError = ref('')

// 切换文章时清空输入与错误
watch(
  () => articleStore.currentArticleId,
  () => {
    unlockPw.value = ''
    unlockError.value = ''
  }
)

async function doUnlock() {
  unlockError.value = ''
  if (!unlockPw.value) return
  const ok = await articleStore.unlockCurrent(unlockPw.value)
  if (!ok) {
    unlockError.value = '密码错误，请重试'
    unlockPw.value = ''
  }
}
</script>

<style scoped lang="scss">
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
</style>

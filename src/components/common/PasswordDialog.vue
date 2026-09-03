<template>
  <div v-if="modelValue" class="pw-overlay" @click.self="cancel">
    <div class="pw-panel">
      <div class="pw-title">{{ title }}</div>
      <input
        ref="inputRef"
        v-model="pw"
        type="password"
        class="pw-input"
        :placeholder="mode === 'set' ? '设置密码' : '输入密码'"
        @keydown.enter="confirm"
        @keydown.escape="cancel"
      />
      <input
        v-if="mode === 'set'"
        v-model="pw2"
        type="password"
        class="pw-input"
        placeholder="再次输入以确认"
        @keydown.enter="confirm"
        @keydown.escape="cancel"
      />
      <div v-if="error" class="pw-error">{{ error }}</div>
      <div class="pw-actions">
        <button class="pw-btn ghost" @click="cancel">取消</button>
        <button class="pw-btn primary" @click="confirm">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    /** set = 设置密码（二次确认），enter = 验证密码 */
    mode?: 'set' | 'enter'
  }>(),
  { title: '加密笔记', mode: 'set' }
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', password: string): void
}>()

const pw = ref('')
const pw2 = ref('')
const error = ref('')
const inputRef = ref<HTMLInputElement>()

watch(
  () => props.modelValue,
  async (v) => {
    if (v) {
      pw.value = ''
      pw2.value = ''
      error.value = ''
      await nextTick()
      inputRef.value?.focus()
    }
  }
)

function cancel() {
  emit('update:modelValue', false)
}

function confirm() {
  if (!pw.value) {
    error.value = '密码不能为空'
    return
  }
  if (props.mode === 'set' && pw.value !== pw2.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  emit('confirm', pw.value)
  emit('update:modelValue', false)
}
</script>

<style scoped lang="scss">
.pw-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 24vh;
}

.pw-panel {
  width: 320px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pw-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.pw-input {
  width: 100%;
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

.pw-error {
  font-size: 12px;
  color: var(--danger-color);
}

.pw-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.pw-btn {
  padding: 7px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  border: none;

  &.primary {
    background: var(--accent-color);
    color: #fff;

    &:hover {
      background: var(--accent-hover);
    }
  }

  &.ghost {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-strong);

    &:hover {
      background: var(--bg-tertiary);
    }
  }
}
</style>

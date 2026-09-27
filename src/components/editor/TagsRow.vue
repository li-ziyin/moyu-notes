<template>
  <div class="tags-row">
    <span v-for="tag in tags" :key="tag" class="tag-chip">
      # {{ tag }}
      <button class="tag-remove" :title="`移除标签「${tag}」`" @click="emit('remove', tag)">
        <n-icon size="10"><close-outline /></n-icon>
      </button>
    </span>
    <button v-if="!addingTag" class="tag-add" @click="startAddTag">
      <n-icon size="12"><pricetag-outline /></n-icon>
      添加标签
    </button>
    <input
      v-else
      ref="tagInputRef"
      v-model="newTag"
      class="tag-input"
      placeholder="标签名，回车确认"
      @keydown.enter="confirmAddTag"
      @keydown.escape="addingTag = false"
      @blur="confirmAddTag"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { NIcon } from 'naive-ui'
import { CloseOutline, PricetagOutline } from '@vicons/ionicons5'

defineProps<{ tags: string[] }>()
const emit = defineEmits<{
  (e: 'add', tag: string): void
  (e: 'remove', tag: string): void
}>()

const addingTag = ref(false)
const newTag = ref('')
const tagInputRef = ref<HTMLInputElement>()

async function startAddTag() {
  addingTag.value = true
  newTag.value = ''
  await nextTick()
  tagInputRef.value?.focus()
}

function confirmAddTag() {
  if (!addingTag.value) return
  const tag = newTag.value.trim()
  addingTag.value = false
  if (tag) emit('add', tag)
}
</script>

<style scoped lang="scss">
.tags-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 20px 10px;
  flex-shrink: 0;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--accent-color);
  background: var(--accent-soft);
  border-radius: 999px;
  padding: 3px 4px 3px 9px;
}

.tag-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;

  &:hover {
    background: rgba(79, 107, 237, 0.2);
  }
}

.tag-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
  background: transparent;
  border: 1px dashed var(--border-strong);
  border-radius: 999px;
  padding: 3px 10px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: var(--accent-color);
    border-color: var(--accent-color);
  }
}

.tag-input {
  width: 140px;
  background: var(--bg-tertiary);
  border: 1px solid var(--accent-color);
  border-radius: 999px;
  color: var(--text-primary);
  font-size: 12px;
  padding: 4px 10px;
  outline: none;

  &::placeholder {
    color: var(--text-tertiary);
  }
}
</style>

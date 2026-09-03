<template>
  <div class="preview-wrapper" @click="onPreviewClick">
    <!-- 有内容 → 实时渲染 -->
    <MarkdownPreview
      v-if="articleStore.currentArticle && articleStore.currentContent.trim() !== ''"
      :content="articleStore.currentContent"
    />
    <!-- 有笔记但内容为空 -->
    <div v-else-if="articleStore.currentArticle" class="preview-empty">
      <n-icon size="36" class="empty-icon"><reader-outline /></n-icon>
      <p>开始输入，预览将在这里实时呈现</p>
    </div>
    <!-- 未打开笔记 -->
    <div v-else class="preview-empty">
      <n-icon size="36" class="empty-icon"><reader-outline /></n-icon>
      <p>打开笔记后这里会显示实时预览</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { ReaderOutline } from '@vicons/ionicons5'
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import { useArticleStore } from '@/stores/article'

const articleStore = useArticleStore()

/** 双链点击：[[标题]] → 打开对应笔记（不存在则新建） */
function onPreviewClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('.wiki-link')
  if (!el) return
  const title = el.getAttribute('data-wiki')
  if (title) articleStore.openByTitle(title)
}
</script>

<style scoped lang="scss">
.preview-wrapper {
  height: 100%;
  overflow: auto;
  background: var(--bg-primary);
  display: flex;
  justify-content: center;
}

.preview-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);

  .empty-icon {
    margin-bottom: 14px;
    opacity: 0.4;
  }

  p {
    font-size: 13px;
  }
}
</style>

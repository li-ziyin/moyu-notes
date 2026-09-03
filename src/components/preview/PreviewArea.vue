<template>
  <div class="preview-wrapper">
    <MarkdownPreview
      v-if="articleStore.currentArticle"
      :content="articleStore.currentContent"
    />
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

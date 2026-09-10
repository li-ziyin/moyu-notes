<template>
  <div ref="editorContainer" class="monaco-editor-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import loader from '@monaco-editor/loader'
import { useMarkdownShortcuts } from '@/composables/useMarkdownShortcuts'
import { detectPrefix, getNextPrefix } from '@/utils/smartIndent'
import { useArticleStore } from '@/stores/article'

const props = withDefaults(
  defineProps<{
    modelValue: string
    theme?: string
    /** 文章标识：变化时整体重设内容（光标重置是预期行为）；打字过程中的内容同步不会经过这条路径 */
    articleKey?: string | null
  }>(),
  { theme: 'light', articleKey: null }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
  (e: 'imagePaste', file: File): void
}>()

const editorContainer = ref<HTMLDivElement>()
let monacoInstance: any = null
let editorInstance: any = null
let editorDom: HTMLElement | null = null
let completionDisposable: any = null

const { register: registerShortcuts, dispose: disposeShortcuts } =
  useMarkdownShortcuts()

// ── 智能续行：通过 addCommand 真正接管 Enter 键（onKeyDown + preventDefault 在 Monaco 中不可靠） ──
let isComposing = false

function handleEnter() {
  const editor = editorInstance
  if (!editor) return

  // IME 组合中 / 无编辑器实例 → 走默认换行
  if (isComposing) {
    editor.trigger('moyu', 'type', { text: '\n' })
    return
  }

  const selection = editor.getSelection()
  const pos = editor.getPosition()
  const model = editor.getModel()
  if (!pos || !model) return

  // 有选区（替换换行）或光标在行中 → 默认行为
  const line = model.getLineContent(pos.lineNumber)
  const leading = line.slice(0, pos.column - 1)
  const trailing = line.slice(pos.column - 1)
  if ((selection && !selection.isEmpty()) || trailing.trim()) {
    editor.trigger('moyu', 'type', { text: '\n' })
    return
  }

  // 代码块：行首 ```（可带语言标注）→ 补闭合围栏，光标停在中间空行
  if (/^\s*```/.test(leading)) {
    editor.executeEdits('moyu-enter', [
      {
        range: new monacoInstance.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
        text: '\n\n```',
      },
    ])
    editor.setPosition({ lineNumber: pos.lineNumber + 1, column: 1 })
    return
  }

  const prefixInfo = detectPrefix(leading)

  // 空列表项回车 → 删除前缀退出续行（VS Code / Typora 行为）
  if (prefixInfo && leading.trim() === prefixInfo.prefix.trim()) {
    editor.executeEdits('moyu-enter', [
      {
        range: new monacoInstance.Range(
          pos.lineNumber,
          1,
          pos.lineNumber,
          prefixInfo.prefix.length + 1
        ),
        text: '',
      },
    ])
    return
  }

  // 有内容的列表/引用回车 → 下一行自动续行（有序列表自动递增）
  if (prefixInfo) {
    const nextPrefix = getNextPrefix(leading)
    if (nextPrefix) {
      editor.executeEdits('moyu-enter', [
        {
          range: new monacoInstance.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
          text: '\n' + nextPrefix,
        },
      ])
      return
    }
  }

  // 默认换行
  editor.trigger('moyu', 'type', { text: '\n' })
}

/** 粘贴图片 → 交给父组件入库，在光标处插入 asset 引用 */
function onPaste(e: ClipboardEvent) {
  if (isComposing) return
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        e.preventDefault()
        e.stopPropagation()
        emit('imagePaste', file)
      }
      return
    }
  }
}

/** 在光标处插入文本（供父组件调用，如插入图片引用） */
function insertText(text: string) {
  if (!editorInstance) return
  const sel = editorInstance.getSelection()
  editorInstance.executeEdits('moyu-insert', [{ range: sel, text }])
  editorInstance.focus()
}

defineExpose({ insertText })

/** 注册 [[ 双链补全：输入 [[ 后提示全部笔记标题 */
function registerWikiCompletion() {
  const articleStore = useArticleStore()
  completionDisposable = monacoInstance.languages.registerCompletionItemProvider('markdown', {
    triggerCharacters: ['['],
    provideCompletionItems: (model: any, position: any) => {
      const line = model.getLineContent(position.lineNumber)
      const before = line.slice(0, position.column - 1)
      const m = before.match(/\[\[([^[\]\n]*)$/)
      if (!m) return { suggestions: [] }

      const word = m[1]
      const range = new monacoInstance.Range(
        position.lineNumber,
        position.column - word.length,
        position.lineNumber,
        position.column
      )
      const lower = word.toLowerCase()
      const suggestions = articleStore.articles
        .filter(
          (a) =>
            a.isDeleted === 0 &&
            a.id !== articleStore.currentArticleId &&
            a.title.toLowerCase().includes(lower)
        )
        .slice(0, 20)
        .map((a) => ({
          label: a.title,
          kind: monacoInstance.languages.CompletionItemKind.File,
          insertText: `${a.title}]]`,
          range,
          detail: '笔记双链',
          sortText: a.title.toLowerCase() === lower ? '0' + a.title : '1' + a.title,
        }))
      return { suggestions }
    },
  })
}

onMounted(async () => {
  // 自托管：编辑器文件随应用部署（public/monaco/vs），不依赖任何第三方 CDN
  // 用 baseURI 解析，兼容 GitHub Pages 子路径部署
  loader.config({
    paths: {
      vs: new URL('monaco/vs', document.baseURI).href.replace(/\/+$/, ''),
    },
  })

  monacoInstance = await loader.init()

  // 定义与界面调色板一致的专属主题，消除编辑器与预览区的背景色差
  monacoInstance.editor.defineTheme('moyu-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#ffffff' },
  })
  monacoInstance.editor.defineTheme('moyu-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#12151c' },
  })

  editorInstance = monacoInstance.editor.create(editorContainer.value!, {
    value: props.modelValue,
    language: 'markdown',
    theme: props.theme === 'dark' ? 'moyu-dark' : 'moyu-light',
    automaticLayout: true,
    // ── 写作模式：隐藏代码编辑器的视觉噪音 ──
    minimap: { enabled: false },
    fontSize: 15,
    lineHeight: 26,
    lineNumbers: 'off',
    glyphMargin: false,
    folding: false,
    renderLineHighlight: 'none',
    guides: { indentation: false, highlightActiveIndentation: false },
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    matchBrackets: 'never',
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'on',
    padding: { top: 12, bottom: 120 },
    scrollbar: {
      verticalScrollbarSize: 0,
      horizontalScrollbarSize: 0,
    },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    cursorStyle: 'line',
    selectOnLineNumbers: true,
    roundedSelection: false,
  })

  editorInstance.onDidChangeModelContent(() => {
    const value = editorInstance.getValue()
    emit('update:modelValue', value)
    emit('change', value)
  })

  // IME 组合追踪：组合期间的 Enter 是确认候选词，不触发智能续行
  editorDom = editorInstance.getDomNode()
  editorDom?.addEventListener('compositionstart', () => (isComposing = true), true)
  editorDom?.addEventListener('compositionend', () => (isComposing = false), true)
  editorDom?.addEventListener('paste', onPaste)

  registerShortcuts(editorInstance, monacoInstance)
  editorInstance.addCommand(monacoInstance.KeyCode.Enter, handleEnter)
  registerWikiCompletion()
})

watch(
  () => props.theme,
  (newTheme) => {
    if (monacoInstance) {
      monacoInstance.editor.setTheme(newTheme === 'dark' ? 'moyu-dark' : 'moyu-light')
    }
  }
)

// 文章切换：整体重设内容并回到顶部（光标重置是预期行为）
watch(
  () => props.articleKey,
  async () => {
    await nextTick()
    if (editorInstance) {
      editorInstance.setValue(props.modelValue ?? '')
      editorInstance.setPosition({ lineNumber: 1, column: 1 })
      editorInstance.revealLine(1)
    }
  }
)

// 外部内容变更（快照恢复等）：重设内容但尽量保留光标位置
watch(
  () => props.modelValue,
  (newValue) => {
    if (!editorInstance || newValue === editorInstance.getValue()) return
    const prevPos = editorInstance.getPosition()
    editorInstance.setValue(newValue)
    if (prevPos) {
      const model = editorInstance.getModel()
      const line = Math.min(prevPos.lineNumber, model.getLineCount())
      const col = Math.min(prevPos.column, model.getLineMaxColumn(line))
      editorInstance.setPosition({ lineNumber: line, column: col })
    }
  }
)

onBeforeUnmount(() => {
  disposeShortcuts()
  completionDisposable?.dispose()
  completionDisposable = null
  editorDom?.removeEventListener('paste', onPaste)
  editorDom = null
  if (editorInstance) {
    editorInstance.dispose()
    editorInstance = null
  }
})
</script>

<style scoped>
.monaco-editor-container {
  width: 100%;
  height: 100%;
}

/* 去掉 Monaco 自带的编辑器焦点轮廓线，写作界面保持干净 */
.monaco-editor-container :deep(.monaco-editor) {
  outline: none;
}
</style>

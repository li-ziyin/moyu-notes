<template>
  <div class="markdown-preview" v-html="html"></div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { ensureAssetUrls, peekAssetUrl } from '@/services/assets'

const props = defineProps<{
  content: string
}>()

const html = ref('')

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true, // 单个回车也变成 <br>
})

// ── XSS 防护：笔记可能来自导入/同步等不可信来源 ──
// 渲染结果必须经 DOMPurify 消毒：剥离 <script>、on* 事件、javascript: 协议等
// ADD_ATTR 保留 target（外链新窗口打开）
function sanitize(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ADD_ATTR: ['target'] })
}

// ── 外部链接新窗口打开，防反向标签劫持 ──
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const href = tokens[idx].attrGet('href') ?? ''
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener noreferrer')
  }
  return defaultLinkOpen(tokens, idx, options, _env, self)
}

// ── 双链 [[笔记标题]] 内联规则 ──
function wikiInline(state: any, silent: boolean): boolean {
  const src = state.src
  const pos = state.pos
  if (src[pos] !== '[' || src[pos + 1] !== '[') return false
  const end = src.indexOf(']]', pos + 2)
  if (end === -1) return false
  const title = src.slice(pos + 2, end).trim()
  if (!title || title.includes('\n')) return false
  if (!silent) {
    const token = state.push('wiki_link', '', 0)
    token.content = title
  }
  state.pos = end + 2
  return true
}

md.inline.ruler.before('link', 'wiki_link', wikiInline)

md.renderer.rules.wiki_link = (tokens, idx) => {
  const title = tokens[idx].content
  return `<a class="wiki-link" data-wiki="${md.utils.escapeHtml(title)}" title="打开笔记：${md.utils.escapeHtml(title)}">${md.utils.escapeHtml(title)}</a>`
}

// ── asset:// 图片渲染为 blob URL ──
const PLACEHOLDER_IMG =
  'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
const defaultImage = md.renderer.rules.image
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = token.attrGet('src')
  if (src?.startsWith('asset://')) {
    const url = peekAssetUrl(src.slice('asset://'.length))
    token.attrSet('src', url || PLACEHOLDER_IMG)
    token.attrSet('class', 'asset-image')
  }
  return defaultImage!(tokens, idx, options, env, self)
}

watch(
  () => props.content,
  async (newContent) => {
    // 先确保图片资产已生成 blob URL，再渲染并消毒
    await ensureAssetUrls(newContent || '')
    html.value = sanitize(md.render(newContent || ''))
  },
  { immediate: true }
)
</script>

<style scoped lang="scss">
.markdown-preview {
  max-width: 760px;
  flex: 1;
  min-width: 0;
  padding: 20px 36px 80px;
  line-height: 1.8;
  color: var(--text-primary);
  font-size: 15px;
  white-space: normal;
  word-break: break-word;

  :deep(h1) {
    font-size: 26px;
    margin: 20px 0 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-color);
    line-height: 1.4;
  }

  :deep(h2) {
    font-size: 21px;
    margin: 24px 0 12px;
    line-height: 1.4;
  }

  :deep(h3) {
    font-size: 17px;
    margin: 20px 0 10px;
  }

  :deep(h4, h5, h6) {
    font-size: 15px;
    margin: 16px 0 8px;
  }

  :deep(p) {
    margin-bottom: 14px;
    text-indent: 2em;
  }

  :deep(h1 + p),
  :deep(h2 + p),
  :deep(h3 + p),
  :deep(li p),
  :deep(blockquote p),
  :deep(td p),
  :deep(th p) {
    text-indent: 0; // 标题后首段、列表/引用/表格内不缩进
  }

  :deep(br) {
    display: block;
    content: '';
    margin-bottom: 4px;
  }

  :deep(strong) {
    font-weight: 600;
  }

  :deep(code) {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.86em;
  }

  :deep(pre) {
    background: var(--bg-tertiary);
    padding: 16px 18px;
    border-radius: var(--radius-md);
    overflow-x: auto;
    margin-bottom: 16px;
    line-height: 1.6;

    code {
      background: transparent;
      padding: 0;
      font-size: 13px;
    }
  }

  :deep(ul, ol) {
    padding-left: 26px;
    margin-bottom: 14px;
  }

  :deep(li) {
    margin-bottom: 4px;
  }

  :deep(blockquote) {
    border-left: 3px solid var(--accent-color);
    background: var(--accent-soft);
    padding: 10px 16px;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    margin: 0 0 16px;
    color: var(--text-secondary);

    p {
      margin-bottom: 0;
    }
  }

  :deep(hr) {
    border: none;
    border-top: 1px solid var(--border-color);
    margin: 28px 0;
  }

  :deep(a) {
    color: var(--accent-color);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  // 双链样式
  :deep(a.wiki-link) {
    color: var(--accent-color);
    background: var(--accent-soft);
    padding: 0 4px;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  :deep(img) {
    max-width: 100%;
    border-radius: var(--radius-md);
  }

  :deep(table) {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 16px;
    font-size: 14px;

    th, td {
      border: 1px solid var(--border-color);
      padding: 8px 12px;
      text-align: left;
    }

    th {
      background: var(--bg-tertiary);
      font-weight: 600;
    }

    tr:nth-child(even) td {
      background: var(--bg-secondary);
    }
  }

  :deep(mark) {
    background: var(--accent-soft);
    color: var(--accent-color);
    padding: 0 2px;
    border-radius: 2px;
  }
}
</style>

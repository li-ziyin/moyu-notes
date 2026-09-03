<template>
  <div v-if="visible" class="graph-overlay" @click.self="close">
    <div class="graph-panel">
      <div class="graph-header">
        <div class="graph-title">
          <n-icon size="16"><git-network-outline /></n-icon>
          知识图谱
          <span class="graph-stat">{{ nodes.length }} 篇笔记 · {{ edges.length }} 条链接</span>
        </div>
        <div class="graph-actions">
          <button class="graph-btn" title="重新布局" @click="reheat">
            <n-icon size="14"><refresh-outline /></n-icon>
            重排
          </button>
          <button class="icon-btn sm" title="关闭" @click="close">
            <n-icon size="14"><close-outline /></n-icon>
          </button>
        </div>
      </div>
      <div ref="canvasWrap" class="graph-canvas-wrap">
        <canvas ref="canvasRef" @click="onCanvasClick" @mousemove="onCanvasHover" />
        <div v-if="nodes.length === 0" class="graph-empty">
          还没有可展示的笔记或链接<br />
          <span class="graph-empty-sub">在笔记中用 [[标题]] 建立链接后，这里会浮现你的知识网络</span>
        </div>
      </div>
      <div class="graph-footer">点击节点打开笔记 · 悬停高亮连接</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { NIcon } from 'naive-ui'
import { GitNetworkOutline, CloseOutline, RefreshOutline } from '@vicons/ionicons5'
import { useArticleStore } from '@/stores/article'
import { useSettingStore } from '@/stores/setting'
import { storeToRefs } from 'pinia'
import { getAllLinks } from '@/services/links'

interface GNode {
  id: string
  title: string
  x: number
  y: number
  vx: number
  vy: number
  deg: number
}

interface GEdge {
  a: number
  b: number
}

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'open', articleId: string): void
}>()

const articleStore = useArticleStore()
const settingStore = useSettingStore()
const { theme } = storeToRefs(settingStore)

const canvasRef = ref<HTMLCanvasElement>()
const canvasWrap = ref<HTMLDivElement>()
const nodes = ref<GNode[]>([])
const edges = ref<GEdge[]>([])

let rafId = 0
let alpha = 1
let hoverIdx = -1

function close() {
  emit('update:visible', false)
}

// ── 主题色读取 ──
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// ── 数据加载与布局 ──
async function load() {
  const arts = articleStore.articles.filter((a) => a.isDeleted === 0)
  const idToIdx = new Map<string, number>()
  nodes.value = arts.map((a, i) => {
    idToIdx.set(a.id, i)
    return { id: a.id, title: a.title || '未命名', x: 0, y: 0, vx: 0, vy: 0, deg: 0 }
  })

  const links = await getAllLinks()
  const list: GEdge[] = []
  for (const l of links) {
    const ai = idToIdx.get(l.sourceId)
    const bi = idToIdx.get(l.targetId)
    if (ai !== undefined && bi !== undefined && ai !== bi) list.push({ a: ai, b: bi })
  }
  edges.value = list
  nodes.value.forEach((n) => (n.deg = 0))
  edges.value.forEach((e) => {
    nodes.value[e.a].deg++
    nodes.value[e.b].deg++
  })

  initPositions()
  reheat()
}

function initPositions() {
  const n = nodes.value.length
  const w = canvasWrap.value?.clientWidth || 600
  const h = canvasWrap.value?.clientHeight || 400
  nodes.value.forEach((node, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2
    const radius = Math.min(w, h) * 0.32
    node.x = w / 2 + Math.cos(angle) * radius
    node.y = h / 2 + Math.sin(angle) * radius
    node.vx = 0
    node.vy = 0
  })
}

function reheat() {
  alpha = 1
  stop()
  rafId = requestAnimationFrame(tick)
}

function stop() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

function tick() {
  step()
  draw()
  if (alpha > 0.005) {
    rafId = requestAnimationFrame(tick)
  } else {
    rafId = 0
  }
}

const REPULSION = 3600
const SPRING = 0.015
const SPRING_LEN = 130
const GRAVITY = 0.025
const DAMPING = 0.86

function step() {
  const ns = nodes.value
  const n = ns.length
  if (n === 0) return
  const w = canvasWrap.value?.clientWidth || 600
  const h = canvasWrap.value?.clientHeight || 400

  // 斥力
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = ns[j].x - ns[i].x
      const dy = ns[j].y - ns[i].y
      const d2 = Math.max(dx * dx + dy * dy, 64)
      const d = Math.sqrt(d2)
      const f = (REPULSION / d2) * alpha
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      ns[i].vx -= fx
      ns[i].vy -= fy
      ns[j].vx += fx
      ns[j].vy += fy
    }
  }

  // 引力（弹簧）
  for (const e of edges.value) {
    const a = ns[e.a]
    const b = ns[e.b]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
    const f = (d - SPRING_LEN) * SPRING * alpha
    const fx = (dx / d) * f
    const fy = (dy / d) * f
    a.vx += fx
    a.vy += fy
    b.vx -= fx
    b.vy -= fy
  }

  // 向心 + 积分
  for (const node of ns) {
    node.vx += (w / 2 - node.x) * GRAVITY * alpha
    node.vy += (h / 2 - node.y) * GRAVITY * alpha
    node.vx *= DAMPING
    node.vy *= DAMPING
    node.x += Math.max(-24, Math.min(24, node.vx))
    node.y += Math.max(-24, Math.min(24, node.vy))
    // 边界软约束
    const pad = 36
    node.x = Math.max(pad, Math.min(w - pad, node.x))
    node.y = Math.max(pad, Math.min(h - pad, node.y))
  }

  alpha *= 0.985
}

function nodeRadius(node: GNode): number {
  return 5 + Math.min(node.deg * 1.6, 10)
}

// ── 绘制 ──
function draw() {
  const canvas = canvasRef.value
  const wrap = canvasWrap.value
  if (!canvas || !wrap) return
  const dpr = window.devicePixelRatio || 1
  const w = wrap.clientWidth
  const h = wrap.clientHeight
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const ns = nodes.value
  const edgeColor = cssVar('--border-strong')
  const accent = cssVar('--accent-color')
  const textSec = cssVar('--text-tertiary')
  const textPri = cssVar('--text-primary')

  // 边
  ctx.strokeStyle = edgeColor
  ctx.lineWidth = 1
  for (const e of edges.value) {
    const a = ns[e.a]
    const b = ns[e.b]
    if (!a || !b) continue
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  // 节点 + 标签
  ctx.textAlign = 'center'
  for (let i = 0; i < ns.length; i++) {
    const node = ns[i]
    const r = nodeRadius(node)
    const isHover = i === hoverIdx
    const isCurrent = node.id === articleStore.currentArticleId

    ctx.beginPath()
    ctx.arc(node.x, node.y, r + (isHover ? 2 : 0), 0, Math.PI * 2)
    ctx.fillStyle = isCurrent || isHover ? accent : textSec
    ctx.fill()

    if (isCurrent || isHover) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2)
      ctx.strokeStyle = accent
      ctx.globalAlpha = 0.35
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    ctx.font = `${isHover || isCurrent ? 600 : 400} 11px ${cssVar('--font-sans')}`
    ctx.fillStyle = isHover || isCurrent ? textPri : textSec
    const label = node.title.length > 10 ? node.title.slice(0, 10) + '…' : node.title
    ctx.fillText(label, node.x, node.y + r + 14)
  }
}

// ── 交互 ──
function nearestNode(x: number, y: number): number {
  let best = -1
  let bestD = Infinity
  nodes.value.forEach((n, i) => {
    const dx = n.x - x
    const dy = n.y - y
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < nodeRadius(n) + 10 && d < bestD) {
      best = i
      bestD = d
    }
  })
  return best
}

function canvasPos(e: MouseEvent): { x: number; y: number } {
  const rect = canvasRef.value!.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function onCanvasClick(e: MouseEvent) {
  const { x, y } = canvasPos(e)
  const idx = nearestNode(x, y)
  if (idx !== -1) {
    emit('open', nodes.value[idx].id)
    close()
  }
}

function onCanvasHover(e: MouseEvent) {
  const { x, y } = canvasPos(e)
  hoverIdx = nearestNode(x, y)
  if (canvasRef.value) {
    canvasRef.value.style.cursor = hoverIdx !== -1 ? 'pointer' : 'default'
  }
  if (rafId === 0) draw() // 静止时悬停也要重绘
}

// ── 生命周期 ──
watch(
  () => props.visible,
  async (v) => {
    if (v) {
      await nextTick()
      await load()
    } else {
      stop()
    }
  }
)

watch([theme, () => articleStore.linkVersion], () => {
  if (props.visible) {
    load()
  } else if (rafId === 0 && nodes.value.length) {
    draw()
  }
})

let resizeObserver: ResizeObserver | null = null

watch(canvasWrap, (wrap) => {
  resizeObserver?.disconnect()
  if (wrap) {
    resizeObserver = new ResizeObserver(() => {
      if (rafId === 0 && nodes.value.length) draw()
    })
    resizeObserver.observe(wrap)
  }
})

onBeforeUnmount(() => {
  stop()
  resizeObserver?.disconnect()
})
</script>

<style scoped lang="scss">
.graph-overlay {
  position: fixed;
  inset: 0;
  z-index: 110;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.graph-panel {
  width: min(860px, 92vw);
  height: min(600px, 84vh);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.graph-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 10px 18px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.graph-title {
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

.graph-stat {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-tertiary);
}

.graph-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.graph-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
}

.icon-btn.sm {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.graph-canvas-wrap {
  flex: 1;
  position: relative;
  min-height: 0;

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
}

.graph-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.9;
}

.graph-empty-sub {
  font-size: 12px;
  color: var(--text-tertiary);
}

.graph-footer {
  padding: 8px 18px;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
</style>

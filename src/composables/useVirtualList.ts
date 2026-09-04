/**
 * 虚拟滚动 composable（零依赖，固定行高）
 * 只渲染可视区 ± overscan 的条目，长列表（数千笔记）滚动不卡顿
 */

import { ref, computed, onMounted, onBeforeUnmount, watch, type Ref } from 'vue'

export function useVirtualList<T>(
  container: Ref<HTMLElement | null>,
  items: Ref<T[]>,
  itemHeight: number,
  overscan = 8
) {
  const scrollTop = ref(0)
  const viewportHeight = ref(0)

  let rafId = 0

  function measure() {
    const el = container.value
    if (!el) return
    viewportHeight.value = el.clientHeight
    scrollTop.value = el.scrollTop
  }

  function onScroll() {
    // 合并到下一帧，避免高频 scroll 事件触发过多响应式更新
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      scrollTop.value = container.value?.scrollTop ?? 0
    })
  }

  /** 第一个渲染条目的索引（含 overscan） */
  const start = computed(() =>
    Math.max(0, Math.floor(scrollTop.value / itemHeight) - overscan)
  )

  /** 可视区条目数（含 overscan 上下缓冲） */
  const count = computed(
    () => Math.ceil(viewportHeight.value / itemHeight) + overscan * 2
  )

  /** 当前应渲染的条目切片 */
  const visibleItems = computed(() =>
    items.value.slice(start.value, start.value + count.value)
  )

  /** 渲染窗口的垂直偏移 */
  const offsetY = computed(() => start.value * itemHeight)

  /** 占位总高度，撑出真实滚动条 */
  const totalHeight = computed(() => items.value.length * itemHeight)

  /** 列表数据变化后如当前滚动位置超出范围，收敛一次 */
  watch(items, () => {
    const el = container.value
    if (!el) return
    const maxScroll = Math.max(0, items.value.length * itemHeight - el.clientHeight)
    if (el.scrollTop > maxScroll) {
      el.scrollTop = maxScroll
      scrollTop.value = maxScroll
    }
  })

  onMounted(() => {
    measure()
    container.value?.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    if (container.value) ro.observe(container.value)
    onBeforeUnmount(() => {
      container.value?.removeEventListener('scroll', onScroll)
      ro.disconnect()
    })
  })

  return { visibleItems, offsetY, totalHeight }
}

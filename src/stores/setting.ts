import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useSettingStore = defineStore('setting', () => {
  const theme = ref<'light' | 'dark'>('light')

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  if (mediaQuery.matches) theme.value = 'dark'

  watch(
    theme,
    (val) => {
      document.documentElement.setAttribute('data-theme', val)
    },
    { immediate: true }
  )

  const toggleTheme = () => {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  // ── 界面布局状态（持久化，大纲为临时状态不持久化） ──
  const sidebarCollapsed = ref(localStorage.getItem('moyu.sidebar-collapsed') === '1')
  const previewVisible = ref(localStorage.getItem('moyu.preview-visible') !== '0')
  const outlineVisible = ref(false)

  watch(sidebarCollapsed, (v) => localStorage.setItem('moyu.sidebar-collapsed', v ? '1' : '0'))
  watch(previewVisible, (v) => localStorage.setItem('moyu.preview-visible', v ? '1' : '0'))

  const toggleSidebar = () => {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }
  const togglePreview = () => {
    previewVisible.value = !previewVisible.value
  }
  const toggleOutline = () => {
    outlineVisible.value = !outlineVisible.value
  }

  return {
    theme,
    toggleTheme,
    sidebarCollapsed,
    previewVisible,
    outlineVisible,
    toggleSidebar,
    togglePreview,
    toggleOutline,
  }
})

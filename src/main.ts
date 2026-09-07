import { createApp } from 'vue'
import naive from 'naive-ui'
import App from './App.vue'
import { pinia } from './stores'
import { useArticleStore } from '@/stores/article'
import '@/assets/styles/index.scss'

const app = createApp(App)
app.use(pinia)
app.use(naive)
app.mount('#app')

// 开发模式暴露 store 便于控制台调试与自动化测试
if (import.meta.env.DEV) {
  ;(window as any).__moyu = { articleStore: useArticleStore(pinia) }
}

// 申请持久化存储：避免浏览器在磁盘紧张时未经确认驱逐 IndexedDB 数据
navigator.storage?.persist?.().catch(() => {})
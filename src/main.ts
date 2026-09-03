import { createApp } from 'vue'
import naive from 'naive-ui'
import App from './App.vue'
import { pinia } from './stores'
import '@/assets/styles/index.scss'

const app = createApp(App)
app.use(pinia)
app.use(naive)
app.mount('#app')
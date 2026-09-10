import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  // 相对路径：兼容 GitHub Pages 子路径部署
  base: './',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: '墨语笔记',
        short_name: '墨语',
        description: '本地优先的 Markdown 笔记应用',
        lang: 'zh-CN',
        theme_color: '#4f6bed',
        background_color: '#12151c',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Monaco 编辑器文件体积大（~4MB），不进预缓存（避免首次安装变慢），
        // 改为运行时缓存：首次在线访问后即可离线使用
        globIgnores: ['**/monaco/**'],
        runtimeCaching: [
          {
            urlPattern: /\/monaco\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'monaco-self-hosted',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/assets/styles/variables.scss" as *;`
      }
    }
  }
})

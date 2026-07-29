import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'
import { join } from 'path'

// https://vite.dev/config/
export default defineConfig({
  // Base path для GitHub Pages: для username.github.io = '/', иначе /repository-name/
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    // Копируем index.html в 404.html — стандартный SPA-роутинг для GitHub Pages
    {
      name: 'copy-404',
      closeBundle() {
        const distPath = join(process.cwd(), 'dist')
        try {
          copyFileSync(join(distPath, 'index.html'), join(distPath, '404.html'))
        } catch (error) {
          console.warn('Could not copy index.html to 404.html:', error.message)
        }
      },
    },
  ],
  server: {
    // host: true → vite слушает 0.0.0.0 (доступ с LAN при необходимости).
    host: true,
    port: 5175,
    // Polling: CHOKIDAR_USEPOLLING=true при проблемном file-watching.
    watch: {
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
    },
    proxy: {
      // Auth-сервис (login / session / logout). Same-origin → cookies first-party.
      '/login': {
        target: process.env.AUTH_PROXY_TARGET || 'http://localhost:3005',
        changeOrigin: true,
      },
      '/auth': {
        target: process.env.AUTH_PROXY_TARGET || 'http://localhost:3005',
        changeOrigin: true,
      },
      // Calc/images/price — напрямую на внешний сервис (не через backend).
      // Иначе при падении :3007 иконки и /api/v2/data дают 500 в Vite.
      '/api/v1': {
        target: process.env.CALC_PROXY_TARGET || 'http://localhost:3005',
        changeOrigin: true,
      },
      '/api/v2': {
        target: process.env.CALC_PROXY_TARGET || 'http://localhost:3005',
        changeOrigin: true,
      },
      // Наш backend: offers, health (и calc-proxy в prod через этот же путь).
      '/api': {
        target: process.env.BACKEND_PROXY_TARGET || 'http://localhost:3007',
        changeOrigin: true,
      },
    },
  },
})

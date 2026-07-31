import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'
import { join } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv: переменные из .env* доступны в proxy target (process.env в конфиге сам по себе их не видит).
  const env = loadEnv(mode, process.cwd(), '')
  const authTarget =
    env.AUTH_PROXY_TARGET || process.env.AUTH_PROXY_TARGET || 'http://localhost:3005'
  const calcTarget =
    env.CALC_PROXY_TARGET || process.env.CALC_PROXY_TARGET || 'http://localhost:3005'
  const backendTarget =
    env.BACKEND_PROXY_TARGET || process.env.BACKEND_PROXY_TARGET || 'http://localhost:3007'

  return {
  // Base path для GitHub Pages: для username.github.io = '/', иначе /repository-name/
  base: process.env.BASE_PATH || env.BASE_PATH || '/',
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
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' || env.CHOKIDAR_USEPOLLING === 'true',
    },
    proxy: {
      // Auth-сервис (login / session / logout). Same-origin → cookies first-party.
      '/login': {
        target: authTarget,
        changeOrigin: true,
      },
      '/auth': {
        target: authTarget,
        changeOrigin: true,
      },
      // Calc/images/price — напрямую на внешний сервис (не через backend).
      // Иначе при падении :3007 иконки и /api/v2/data дают 500 в Vite.
      // Локальный :3005 часто без новых шифров (AG.C501_ul, AG.Ct_eco, AG.Cs_mat) —
      // задайте CALC_PROXY_TARGET=https://dev3.constrtodo.ru:3005 в .env.development.local.
      '/api/v1': {
        target: calcTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/v2': {
        target: calcTarget,
        changeOrigin: true,
        secure: false,
      },
      // Наш backend: offers, health (и calc-proxy в prod через этот же путь).
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  }
})
